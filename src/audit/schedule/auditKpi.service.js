import { Schedule } from "./schedule.model.js";
import { Org } from "./organization/org.model.js";
import { Team } from "../../teams/team.model.js";
import mongoose from "mongoose";

/**
 * Calculate comprehensive KPIs for a specific audit schedule
 * @param {string} auditScheduleId - The audit schedule ID
 * @returns {Object} KPI metrics object
 */
export const calculateAuditKpis = async (auditScheduleId) => {
  try {
    console.log("[KPI] Starting KPI calculation for:", auditScheduleId);

    // Convert to ObjectId if string
    const scheduleObjectId = mongoose.Types.ObjectId.isValid(auditScheduleId)
      ? new mongoose.Types.ObjectId(auditScheduleId)
      : auditScheduleId;

    console.log("[KPI] Fetching schedule...");
    // Get the schedule details
    const schedule = await Schedule.findById(scheduleObjectId);
    if (!schedule) {
      throw new Error("Audit schedule not found");
    }
    console.log("[KPI] Schedule found:", schedule.title);

    console.log("[KPI] Fetching organizations...");
    // Get all organizations for this audit schedule
    const organizations = await Org.find({
      auditScheduleId: scheduleObjectId,
    });
    console.log("[KPI] Organizations found:", organizations.length);

    // ==================== AUDIT SCHEDULE KPIs ====================

    // 1. Audit Completion Rate (%)
    // Formula: (Completed audits / Total audits) * 100
    const totalOrganizations = organizations.length;
    const completedOrganizations = organizations.filter(
      (org) =>
        org.status === "completed" || org.status === 2 || org.status === 3,
    ).length;
    const auditCompletionRate =
      totalOrganizations > 0
        ? ((completedOrganizations / totalOrganizations) * 100).toFixed(2)
        : 0;

    // 2. Audit Execution Rate (%)
    // Formula: (Audits with at least 1 visit / Total audits) * 100
    const orgsWithVisits = organizations.filter(
      (org) => org.visits && org.visits.length > 0,
    ).length;
    const auditExecutionRate =
      totalOrganizations > 0
        ? ((orgsWithVisits / totalOrganizations) * 100).toFixed(2)
        : 0;

    // 3. Average Audit Duration (days)
    // Formula: Average of (visit.end - visit.start) across all visits
    const durations = [];
    console.log(
      `[KPI] Processing ${organizations.length} organizations for duration calculation`,
    );

    organizations.forEach((org, orgIdx) => {
      if (org.visits && org.visits.length > 0) {
        console.log(`[KPI] Org ${orgIdx}: ${org.visits.length} visits`);
        org.visits.forEach((visit, visitIdx) => {
          console.log(`[KPI] Visit ${visitIdx} structure:`, {
            hasDate: !!visit.date,
            dateStart: visit.date?.start,
            dateEnd: visit.date?.end,
            allKeys: Object.keys(visit),
          });

          if (visit.date?.start && visit.date?.end) {
            const startDate = new Date(visit.date.start);
            const endDate = new Date(visit.date.end);
            const durationDays = Math.ceil(
              (endDate - startDate) / (1000 * 60 * 60 * 24),
            );
            // Count same-day audits as 1 day minimum
            const finalDuration = durationDays === 0 ? 1 : durationDays;
            console.log(
              `[KPI] Duration calculated: ${finalDuration} day(s) (raw: ${durationDays})`,
            );
            durations.push(finalDuration);
          }
        });
      }
    });

    console.log(
      `[KPI] Total durations collected: ${durations.length}`,
      durations,
    );

    const averageAuditDuration =
      durations.length > 0
        ? (durations.reduce((sum, d) => sum + d, 0) / durations.length).toFixed(
            2,
          )
        : 0;

    // ==================== AUDIT FINDINGS KPIs ====================

    console.log("[KPI] Starting findings aggregation...");
    // Aggregate all findings from all organizations
    const findingsAggregation = await Org.aggregate([
      // Match organizations for this audit schedule
      {
        $match: {
          auditScheduleId: scheduleObjectId,
        },
      },
      // Unwind visits array
      {
        $unwind: {
          path: "$visits",
          preserveNullAndEmptyArrays: false, // Skip orgs without visits
        },
      },
      // Unwind findings array
      {
        $unwind: {
          path: "$visits.findings",
          preserveNullAndEmptyArrays: false, // Skip visits without findings
        },
      },
      // Filter out null findings
      {
        $match: {
          "visits.findings": { $exists: true, $ne: null },
        },
      },
      // Group to calculate KPIs
      {
        $group: {
          _id: null,
          totalFindings: { $sum: 1 },
          majorNC: {
            $sum: {
              $cond: [
                { $eq: ["$visits.findings.compliance", "MAJOR_NC"] },
                1,
                0,
              ],
            },
          },
          minorNC: {
            $sum: {
              $cond: [
                { $eq: ["$visits.findings.compliance", "MINOR_NC"] },
                1,
                0,
              ],
            },
          },
          observations: {
            $sum: {
              $cond: [
                { $eq: ["$visits.findings.compliance", "OBSERVATIONS"] },
                1,
                0,
              ],
            },
          },
          closedFindings: {
            $sum: {
              $cond: [{ $eq: ["$visits.findings.corrected", 1] }, 1, 0],
            },
          },
          allFindings: { $push: "$visits.findings" },
        },
      },
      { $limit: 1 }, // Only need one result
    ]);

    console.log(
      "[KPI] Findings aggregation complete. Results:",
      findingsAggregation.length,
    );

    // Default values if no findings exist
    let totalFindings = 0;
    let majorNC = 0;
    let minorNC = 0;
    let observations = 0;
    let closedFindings = 0;
    let allFindings = [];

    if (findingsAggregation.length > 0) {
      const result = findingsAggregation[0];
      totalFindings = result.totalFindings || 0;
      majorNC = result.majorNC || 0;
      minorNC = result.minorNC || 0;
      observations = result.observations || 0;
      closedFindings = result.closedFindings || 0;
      allFindings = result.allFindings || [];
    }

    // 1. Total Findings
    const totalFindingsCount = totalFindings;

    // 2. Non-Conformity Rate (%)
    // Formula: ((MAJOR_NC + MINOR_NC) / Total Findings) * 100
    const totalNC = majorNC + minorNC;
    const nonConformityRate =
      totalFindings > 0 ? ((totalNC / totalFindings) * 100).toFixed(2) : 0;

    // 3. Major vs Minor Count
    const majorVsMinorCount = {
      major: majorNC,
      minor: minorNC,
      observations: observations,
    };

    // 4. Corrective Action Closure Rate (%)
    // Formula: (Closed findings / Total findings) * 100
    const correctiveActionClosureRate =
      totalFindings > 0
        ? ((closedFindings / totalFindings) * 100).toFixed(2)
        : 0;

    // 5. Findings per Clause (group by ISO clause)
    // Extract and count objectives (clauses) - limit processing
    console.log("[KPI] Processing findings per clause...");
    const clauseMap = {};
    const findingsLimit = Math.min(allFindings.length, 10000); // Limit to prevent memory issues

    for (let i = 0; i < findingsLimit; i++) {
      const finding = allFindings[i];
      if (finding.objectives && Array.isArray(finding.objectives)) {
        finding.objectives.forEach((objective) => {
          const clauseId = objective._id || objective;
          if (clauseId) {
            clauseMap[clauseId] = (clauseMap[clauseId] || 0) + 1;
          }
        });
      }
    }

    // Get all teams to fetch objective descriptions
    const teams = await Team.find({});
    const objectivesMap = {};
    teams.forEach((team) => {
      if (team.objectives && Array.isArray(team.objectives)) {
        team.objectives.forEach((obj) => {
          if (obj._id) {
            objectivesMap[obj._id.toString()] =
              obj.description || obj.title || obj._id.toString();
          }
        });
      }
    });

    // Convert to array and sort by count
    const findingsPerClause = Object.entries(clauseMap)
      .map(([clause, count]) => ({
        clause,
        description: objectivesMap[clause] || clause,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50); // Limit to top 50 clauses

    // 6. NC and Findings Metrics per Team with Contribution Percentage
    // Formulas:
    // - Total Findings per Team = Count of all findings
    // - Total NC per Team = Count of MAJOR_NC + MINOR_NC
    // - NC Percentage per Team = (Total NC / Total Findings) × 100
    // - Team Contribution to Overall NC = (Team NC / Total NC across all teams) × 100
    console.log("[KPI] Calculating NC Metrics per Team...");

    const ncMetricsPerTeam = await Org.aggregate([
      // Match organizations for this audit schedule
      {
        $match: {
          auditScheduleId: scheduleObjectId,
        },
      },
      // Unwind visits array
      {
        $unwind: {
          path: "$visits",
          preserveNullAndEmptyArrays: false,
        },
      },
      // Unwind findings array
      {
        $unwind: {
          path: "$visits.findings",
          preserveNullAndEmptyArrays: false,
        },
      },
      // Filter out null findings
      {
        $match: {
          "visits.findings": { $exists: true, $ne: null },
        },
      },
      // Group by team to calculate team-level metrics
      {
        $group: {
          _id: "$team",
          totalFindings: { $sum: 1 },
          totalNC: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$visits.findings.compliance",
                    ["MAJOR_NC", "MINOR_NC"],
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      // Add a facet to calculate overall totals and team metrics in parallel
      {
        $facet: {
          teamMetrics: [
            {
              $project: {
                _id: 0,
                team: "$_id",
                totalFindings: 1,
                totalNC: 1,
              },
            },
          ],
          overallTotals: [
            {
              $group: {
                _id: null,
                totalNCAllTeams: { $sum: "$totalNC" },
              },
            },
          ],
        },
      },
      // Unwind to merge the results
      {
        $unwind: {
          path: "$overallTotals",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Unwind team metrics
      {
        $unwind: {
          path: "$teamMetrics",
          preserveNullAndEmptyArrays: false,
        },
      },
      // Calculate final metrics with contribution percentage
      {
        $project: {
          _id: 0,
          team: "$teamMetrics.team",
          totalFindings: "$teamMetrics.totalFindings",
          totalNC: "$teamMetrics.totalNC",
          // NC Percentage = (Total NC / Total Findings) × 100
          ncPercentage: {
            $cond: [
              { $gt: ["$teamMetrics.totalFindings", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          "$teamMetrics.totalNC",
                          "$teamMetrics.totalFindings",
                        ],
                      },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          // Team Contribution = (Team NC / Total NC across all teams) × 100
          ncContributionPercentage: {
            $cond: [
              { $gt: ["$overallTotals.totalNCAllTeams", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          "$teamMetrics.totalNC",
                          "$overallTotals.totalNCAllTeams",
                        ],
                      },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },
      // Sort by total NC descending
      {
        $sort: { totalNC: -1 },
      },
    ]);

    console.log(
      `[KPI] NC Metrics per Team calculated: ${ncMetricsPerTeam.length} teams`,
    );

    // 7. Team Contribution to Overall NC Percentage
    // CRITICAL: Shows each team's contribution to the overall NC percentage
    // Formula: (Team NC / Total Findings GLOBAL) × 100
    // Sum of all team contributions = Overall NC Percentage
    console.log("[KPI] Calculating Team NC Contribution to Overall NC...");

    const ncContributionResult = await Org.aggregate([
      // Match organizations for this audit schedule
      {
        $match: {
          auditScheduleId: scheduleObjectId,
        },
      },
      // Unwind visits array
      {
        $unwind: {
          path: "$visits",
          preserveNullAndEmptyArrays: false,
        },
      },
      // Unwind findings array
      {
        $unwind: {
          path: "$visits.findings",
          preserveNullAndEmptyArrays: false,
        },
      },
      // Filter out null findings
      {
        $match: {
          "visits.findings": { $exists: true, $ne: null },
        },
      },
      // Use facet to calculate global totals and team metrics in parallel
      {
        $facet: {
          // Calculate global totals
          globalTotals: [
            {
              $group: {
                _id: null,
                totalFindingsGlobal: { $sum: 1 },
                totalNCGlobal: {
                  $sum: {
                    $cond: [
                      {
                        $in: [
                          "$visits.findings.compliance",
                          ["MAJOR_NC", "MINOR_NC"],
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
          // Calculate team-level NC counts
          teamMetrics: [
            {
              $group: {
                _id: "$team",
                teamNC: {
                  $sum: {
                    $cond: [
                      {
                        $in: [
                          "$visits.findings.compliance",
                          ["MAJOR_NC", "MINOR_NC"],
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
              },
            },
          ],
        },
      },
      // Unwind global totals
      {
        $unwind: {
          path: "$globalTotals",
          preserveNullAndEmptyArrays: true,
        },
      },
      // Unwind team metrics
      {
        $unwind: {
          path: "$teamMetrics",
          preserveNullAndEmptyArrays: false,
        },
      },
      // Calculate team contribution percentage
      {
        $project: {
          _id: 0,
          team: "$teamMetrics._id",
          teamNC: "$teamMetrics.teamNC",
          // Team Contribution % = (Team NC / Total Findings GLOBAL) × 100
          contributionPercentage: {
            $cond: [
              { $gt: ["$globalTotals.totalFindingsGlobal", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: [
                          "$teamMetrics.teamNC",
                          "$globalTotals.totalFindingsGlobal",
                        ],
                      },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          // Include global totals for response
          totalFindingsGlobal: "$globalTotals.totalFindingsGlobal",
          totalNCGlobal: "$globalTotals.totalNCGlobal",
        },
      },
      // Sort by contribution percentage descending
      {
        $sort: { contributionPercentage: -1 },
      },
    ]);

    // Calculate overall NC percentage
    let overallNcPercentage = 0;
    let teamNcContribution = [];

    if (ncContributionResult.length > 0) {
      const { totalFindingsGlobal, totalNCGlobal } = ncContributionResult[0];

      // Overall NC Percentage = (Total NC GLOBAL / Total Findings GLOBAL) × 100
      overallNcPercentage =
        totalFindingsGlobal > 0
          ? parseFloat(((totalNCGlobal / totalFindingsGlobal) * 100).toFixed(2))
          : 0;

      // Extract team contributions
      teamNcContribution = ncContributionResult.map((item) => ({
        team: item.team,
        teamNC: item.teamNC,
        contributionPercentage: item.contributionPercentage,
      }));
    }

    const ncContributionPerTeam = {
      overallNcPercentage,
      teamNcContribution,
    };

    console.log(
      `[KPI] Team NC Contribution calculated: ${teamNcContribution.length} teams, Overall NC: ${overallNcPercentage}%`,
    );

    console.log("[KPI] KPI calculation complete!");

    // ==================== RETURN CONSOLIDATED KPIs ====================

    return {
      auditScheduleKpis: {
        auditCompletionRate: parseFloat(auditCompletionRate),
        auditExecutionRate: parseFloat(auditExecutionRate),
        averageAuditDuration: parseFloat(averageAuditDuration),
        totalOrganizations,
        completedOrganizations,
        orgsWithVisits,
      },
      findingsKpis: {
        totalFindings: totalFindingsCount,
        nonConformityRate: parseFloat(nonConformityRate),
        majorVsMinorCount,
        correctiveActionClosureRate: parseFloat(correctiveActionClosureRate),
        findingsPerClause,
        ncMetricsPerTeam,
        ncContributionPerTeam,
      },
      metadata: {
        auditScheduleId,
        scheduleTitle: schedule.title || "",
        auditCode: schedule.auditCode || "",
        auditType: schedule.auditType || "",
        standard: schedule.standard || "",
        calculatedAt: new Date(),
      },
    };
  } catch (error) {
    console.error("Error calculating audit KPIs:", error);
    throw error;
  }
};

/**
 * Calculate KPIs across all audit schedules (system-wide)
 * @returns {Object} System-wide KPI metrics
 */
export const calculateSystemWideKpis = async () => {
  try {
    const allSchedules = await Schedule.find({});
    const allOrganizations = await Org.find({});

    // Overall completion rate
    const totalOrgs = allOrganizations.length;
    const completedOrgs = allOrganizations.filter(
      (org) => org.status === "completed" || org.status === 2,
    ).length;
    const systemCompletionRate =
      totalOrgs > 0 ? ((completedOrgs / totalOrgs) * 100).toFixed(2) : 0;

    // Total findings across all audits
    const allFindings = [];
    allOrganizations.forEach((org) => {
      if (org.visits && org.visits.length > 0) {
        org.visits.forEach((visit) => {
          if (visit.findings && visit.findings.length > 0) {
            allFindings.push(...visit.findings);
          }
        });
      }
    });

    const totalSystemFindings = allFindings.length;
    const majorNCSystem = allFindings.filter(
      (f) => f.compliance === "MAJOR_NC",
    ).length;
    const minorNCSystem = allFindings.filter(
      (f) => f.compliance === "MINOR_NC",
    ).length;
    const closedFindingsSystem = allFindings.filter(
      (f) => f.corrected === 1,
    ).length;

    return {
      systemKpis: {
        totalSchedules: allSchedules.length,
        totalOrganizations: totalOrgs,
        completedOrganizations: completedOrgs,
        systemCompletionRate: parseFloat(systemCompletionRate),
        totalFindings: totalSystemFindings,
        majorNC: majorNCSystem,
        minorNC: minorNCSystem,
        closedFindings: closedFindingsSystem,
        closureRate:
          totalSystemFindings > 0
            ? ((closedFindingsSystem / totalSystemFindings) * 100).toFixed(2)
            : 0,
      },
      calculatedAt: new Date(),
    };
  } catch (error) {
    console.error("Error calculating system-wide KPIs:", error);
    throw error;
  }
};
