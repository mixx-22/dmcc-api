import {
  calculateAuditKpis,
  calculateSystemWideKpis,
} from "./auditKpi.service.js";
import mongoose from "mongoose";
import { Schedule } from "./schedule.model.js";

/**
 * Get KPIs for schedules with filtering options
 * GET /api/audits/latest/kpis?year=2026&scheduleId=xxx
 * GET /api/audits/latest/kpis?year=2026&scheduleId=All (returns all schedules for the year)
 */
export const getLatestAuditKpis = async (req, res) => {
  try {
    // Get year from query or default to current year
    const currentYear = new Date().getFullYear();
    const year = req.query.year ? parseInt(req.query.year, 10) : currentYear;
    const scheduleIdParam = req.query.scheduleId
      ? req.query.scheduleId.trim()
      : null;

    console.log(
      `[KPI Dashboard] Request params - year: ${year}, scheduleId: "${scheduleIdParam}" (type: ${typeof scheduleIdParam})`,
    );

    // Build filter
    const filter = { deletedAt: null };

    // Check if multiple schedule IDs are passed (comma-separated)
    const isMultipleSchedules =
      scheduleIdParam && scheduleIdParam.includes(",");
    const scheduleIds = isMultipleSchedules
      ? scheduleIdParam.split(",").map((id) => id.trim())
      : scheduleIdParam
        ? [scheduleIdParam]
        : [];

    console.log(`[KPI Dashboard] Parsed schedule IDs:`, scheduleIds);

    // Determine if we need to filter by year
    const shouldFilterByYear =
      !scheduleIdParam || scheduleIdParam === "All" || isMultipleSchedules;

    // Filter by specific schedule if provided (and not "All" or multiple)
    if (scheduleIdParam && scheduleIdParam !== "All" && !isMultipleSchedules) {
      if (!mongoose.Types.ObjectId.isValid(scheduleIdParam)) {
        console.log(
          `[KPI Dashboard] Invalid schedule ID: "${scheduleIdParam}" (length: ${scheduleIdParam.length})`,
        );
        return res.status(400).json({
          success: false,
          message: `Invalid schedule ID format. ID must be a 24-character hexadecimal string. Received: "${scheduleIdParam}" (length: ${scheduleIdParam.length})`,
        });
      }
      filter._id = scheduleIdParam;
      filter.status = 1; // Only active schedules
      console.log(
        `[KPI Dashboard] Filtering by specific schedule ID: ${scheduleIdParam}`,
      );
    } else if (isMultipleSchedules) {
      // Validate all schedule IDs
      const invalidIds = scheduleIds.filter(
        (id) => !mongoose.Types.ObjectId.isValid(id),
      );
      if (invalidIds.length > 0) {
        console.log(`[KPI Dashboard] Invalid schedule IDs:`, invalidIds);
        return res.status(400).json({
          success: false,
          message: `Invalid schedule ID format for: ${invalidIds.join(", ")}`,
        });
      }
      // Filter by multiple schedule IDs
      filter._id = { $in: scheduleIds };
      filter.status = 1; // Only active schedules
      console.log(
        `[KPI Dashboard] Filtering by multiple schedule IDs:`,
        scheduleIds,
      );
    } else if (shouldFilterByYear) {
      // Filter by year if scheduleId is "All" or not provided
      // Include schedules with no date or matching year, and status = 1
      filter.status = 1; // Only active schedules
      if (!isNaN(year)) {
        filter.$or = [
          {
            "date.start": {
              $gte: new Date(`${year}-01-01T00:00:00.000Z`),
              $lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
            },
          },
          {
            "date.start": { $exists: false },
          },
          {
            "date.start": null,
          },
        ];
        console.log(
          `[KPI Dashboard] Filtering by year: ${year} (including schedules without dates, status = 1)`,
        );
      }
    }

    console.log(
      `[KPI Dashboard] Query filter:`,
      JSON.stringify(filter, null, 2),
    );

    // Find schedules matching the filter
    const schedules = await Schedule.find(filter)
      .sort({ createdAt: -1 })
      .select("_id title auditCode auditType standard date");

    console.log(
      `[KPI Dashboard] Query returned ${schedules?.length || 0} schedule(s)`,
    );

    if (!schedules || schedules.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No audit schedules found",
      });
    }

    console.log(`[KPI Dashboard] Found ${schedules.length} schedule(s)`);
    schedules.forEach((s) => {
      console.log(`  - ${s.title} (ID: ${s._id}), date:`, s.date);
    });

    // If specific single schedule, calculate KPIs for that schedule only
    if (scheduleIdParam && scheduleIdParam !== "All" && !isMultipleSchedules) {
      const schedule = schedules[0];
      try {
        console.log(
          `[KPI Dashboard] Calculating KPIs for specific schedule: ${schedule.title}`,
        );
        const kpis = await calculateAuditKpis(schedule._id.toString());

        const response = {
          success: true,
          message: "Schedule KPIs retrieved successfully",
          data: {
            year,
            scheduleId: schedule._id,
            scheduleTitle: schedule.title,
            auditCode: schedule.auditCode || "",
            auditType: schedule.auditType || "",
            standard: schedule.standard || "",
            date: schedule.date || { start: null, end: null },
            ...kpis,
          },
        };

        console.log(`[KPI Dashboard] Returning KPIs for single schedule`);
        return res.status(200).json(response);
      } catch (error) {
        console.error(
          `Error calculating KPIs for schedule ${schedule._id}:`,
          error,
        );
        return res.status(500).json({
          success: false,
          message: "Failed to calculate schedule KPIs",
          error: error.message,
        });
      }
    }

    // If "All" schedules or multiple schedules, combine KPIs from all selected schedules
    console.log(
      `[KPI Dashboard] Calculating combined KPIs for ${schedules.length} schedules`,
    );

    // Get all schedule IDs for aggregation
    const allScheduleIds = schedules.map((s) => s._id);

    // Import Org model for combined aggregation
    const { Org } = await import("./organization/org.model.js");

    // Get all organizations for all schedules in the year
    const allOrganizations = await Org.find({
      auditScheduleId: { $in: allScheduleIds },
    });

    console.log(
      `[KPI Dashboard] Found ${allOrganizations.length} total organizations across all schedules`,
    );

    // Calculate combined schedule KPIs
    const totalOrganizations = allOrganizations.length;

    // Log status values to debug completion rate
    console.log(
      "[KPI Dashboard] Organization statuses:",
      allOrganizations.map((org) => ({
        team: org.team,
        status: org.status,
        statusType: typeof org.status,
      })),
    );

    const completedOrganizations = allOrganizations.filter(
      (org) =>
        org.status === "completed" || org.status === 2 || org.status === 3,
    ).length;

    console.log(
      `[KPI Dashboard] Completed organizations: ${completedOrganizations} out of ${totalOrganizations}`,
    );

    const auditCompletionRate =
      totalOrganizations > 0
        ? ((completedOrganizations / totalOrganizations) * 100).toFixed(2)
        : 0;

    const orgsWithVisits = allOrganizations.filter(
      (org) => org.visits && org.visits.length > 0,
    ).length;
    const auditExecutionRate =
      totalOrganizations > 0
        ? ((orgsWithVisits / totalOrganizations) * 100).toFixed(2)
        : 0;

    // Calculate average audit duration
    const durations = [];
    console.log(
      `[KPI Dashboard] Processing ${allOrganizations.length} organizations for duration calculation`,
    );

    allOrganizations.forEach((org) => {
      if (org.visits && org.visits.length > 0) {
        console.log(
          `[KPI Dashboard] Organization has ${org.visits.length} visits`,
        );
        org.visits.forEach((visit, idx) => {
          console.log(`[KPI Dashboard] Visit ${idx} structure:`, {
            hasDate: !!visit.date,
            dateStart: visit.date?.start,
            dateEnd: visit.date?.end,
            visitKeys: Object.keys(visit),
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
              `[KPI Dashboard] Calculated duration: ${finalDuration} day(s) (raw: ${durationDays})`,
            );
            durations.push(finalDuration);
          }
        });
      }
    });

    console.log(
      `[KPI Dashboard] Total durations collected: ${durations.length}`,
      durations,
    );

    const averageAuditDuration =
      durations.length > 0
        ? (durations.reduce((sum, d) => sum + d, 0) / durations.length).toFixed(
            2,
          )
        : 0;

    // Aggregate findings from all schedules
    console.log(
      `[KPI Dashboard] Starting findings aggregation with scheduleIds:`,
      allScheduleIds.map((id) => id.toString()),
    );

    const findingsAggregation = await Org.aggregate([
      {
        $match: {
          auditScheduleId: { $in: allScheduleIds },
        },
      },
      {
        $unwind: {
          path: "$visits",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $unwind: {
          path: "$visits.findings",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $match: {
          "visits.findings": { $exists: true, $ne: null },
        },
      },
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
              $cond: [
                {
                  $and: [
                    {
                      $in: [
                        "$visits.findings.compliance",
                        ["MAJOR_NC", "MINOR_NC"],
                      ],
                    },
                    {
                      $in: ["$visits.findings.corrected", [2, "2"]],
                    },
                  ],
                },
                1,
                0,
              ],
            },
          },
          allFindings: { $push: "$visits.findings" },
        },
      },
      { $limit: 1 },
    ]);

    console.log(`[KPI Dashboard] Findings aggregation returned:`, {
      resultCount: findingsAggregation.length,
      fullResult:
        findingsAggregation.length > 0
          ? JSON.stringify(
              {
                totalFindings: findingsAggregation[0].totalFindings,
                majorNC: findingsAggregation[0].majorNC,
                minorNC: findingsAggregation[0].minorNC,
                observations: findingsAggregation[0].observations,
                closedFindings: findingsAggregation[0].closedFindings,
                findingsCount: findingsAggregation[0].allFindings?.length || 0,
              },
              null,
              2,
            )
          : "No results",
    });

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

      console.log(`[KPI Dashboard] Aggregation result:`, {
        totalFindings,
        majorNC,
        minorNC,
        observations,
        closedFindings,
        findingsCount: allFindings.length,
      });

      if (allFindings.length > 0) {
        console.log(
          `[KPI Dashboard] First finding:`,
          JSON.stringify(allFindings[0], null, 2),
        );
        console.log(
          `[KPI Dashboard] First 3 findings:`,
          JSON.stringify(allFindings.slice(0, 3), null, 2),
        );
      } else {
        console.log(`[KPI Dashboard] No findings in aggregation result`);
      }
    }

    const totalNC = majorNC + minorNC;
    const nonConformityRate =
      totalFindings > 0 ? ((totalNC / totalFindings) * 100).toFixed(2) : 0;

    const correctiveActionClosureRate =
      totalNC > 0 ? ((closedFindings / totalNC) * 100).toFixed(2) : 0;

    // Findings per clause (objective)
    const clauseMap = {};
    const findingsLimit = Math.min(allFindings.length, 10000);

    console.log(
      `[KPI Dashboard] Processing ${findingsLimit} findings for clause grouping`,
    );

    for (let i = 0; i < findingsLimit; i++) {
      const finding = allFindings[i];
      if (finding.objective) {
        const objectiveName = finding.objective;
        clauseMap[objectiveName] = (clauseMap[objectiveName] || 0) + 1;
      }
    }

    console.log(`[KPI Dashboard] Clause map:`, clauseMap);

    // Build findings per clause/objective
    const findingsPerClause = Object.entries(clauseMap)
      .map(([objective, count]) => ({
        clause: objective,
        description: objective,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    const response = {
      success: true,
      message: "Combined KPIs retrieved successfully",
      data: {
        year,
        scheduleId: isMultipleSchedules
          ? scheduleIds.join(",")
          : scheduleIdParam || "All",
        totalSchedules: schedules.length,
        schedulesList: schedules.map((s) => ({
          id: s._id,
          title: s.title,
          auditCode: s.auditCode,
        })),
        auditScheduleKpis: {
          auditCompletionRate: parseFloat(auditCompletionRate),
          auditExecutionRate: parseFloat(auditExecutionRate),
          averageAuditDuration: parseFloat(averageAuditDuration),
          totalOrganizations,
          completedOrganizations,
          orgsWithVisits,
        },
        findingsKpis: {
          totalFindings,
          nonConformityRate: parseFloat(nonConformityRate),
          majorVsMinorCount: {
            major: majorNC,
            minor: minorNC,
            observations,
          },
          correctiveActionClosureRate: parseFloat(correctiveActionClosureRate),
          findingsPerClause,
        },
        metadata: {
          calculatedAt: new Date(),
        },
      },
    };

    console.log(
      `[KPI Dashboard] Returning combined KPIs for year ${year} with ${schedules.length} schedules`,
    );

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error in getLatestAuditKpis:", error);
    console.error("Error stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve schedules KPIs",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

/**
 * Get KPIs for a specific audit schedule
 * GET /api/audits/:auditScheduleId/kpis
 */
export const getAuditKpis = async (req, res) => {
  try {
    const { auditScheduleId } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(auditScheduleId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid audit schedule ID format",
      });
    }

    // Calculate KPIs using service
    const kpis = await calculateAuditKpis(auditScheduleId);

    return res.status(200).json({
      success: true,
      message: "KPIs calculated successfully",
      data: kpis,
    });
  } catch (error) {
    console.error("Error in getAuditKpis:", error);

    // Handle specific errors
    if (error.message === "Audit schedule not found") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to calculate audit KPIs",
      error: error.message,
    });
  }
};

/**
 * Get system-wide KPIs across all audit schedules
 * GET /api/audits/kpis/system
 */
export const getSystemWideKpis = async (req, res) => {
  try {
    // Calculate system-wide KPIs using service
    const kpis = await calculateSystemWideKpis();

    return res.status(200).json({
      success: true,
      message: "System-wide KPIs calculated successfully",
      data: kpis,
    });
  } catch (error) {
    console.error("Error in getSystemWideKpis:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to calculate system-wide KPIs",
      error: error.message,
    });
  }
};
