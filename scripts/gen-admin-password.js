#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();
import { generateKey } from "../src/utils/generateKey.js";
import connectDB from "../src/config/database.js";
import { User } from "../src/users/user.model.js";
import mongoose from "mongoose";
import readline from "readline";

// CLI args parsing
const raw = process.argv.slice(2);
const opts = {
  length: 12,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
};
let identifier = {};
let apply = false;
let autoYes = false;
for (const arg of raw) {
  if (/^--length=(\d+)$/.test(arg)) {
    opts.length = parseInt(arg.split("=")[1], 10);
  } else if (arg === "--no-symbols") {
    opts.symbols = false;
  } else if (arg === "--no-numbers") {
    opts.numbers = false;
  } else if (arg === "--no-uppercase") {
    opts.uppercase = false;
  } else if (arg === "--no-lowercase") {
    opts.lowercase = false;
  } else if (arg.startsWith("--id=")) {
    identifier.id = arg.split("=")[1];
  } else if (arg.startsWith("--username=")) {
    identifier.username = arg.split("=")[1];
  } else if (arg.startsWith("--email=")) {
    identifier.email = arg.split("=")[1];
  } else if (arg === "--apply") {
    apply = true;
  } else if (arg === "--yes" || arg === "-y") {
    autoYes = true;
  } else if (arg === "--help" || arg === "-h") {
    console.log(
      "Usage: node scripts/gen-admin-password.js [--length=N] [--no-symbols] [--no-numbers] [--no-uppercase] [--no-lowercase] [--id=<id>|--username=<username>|--email=<email>] [--apply] [--yes]"
    );
    console.log(
      "By default this is a dry-run. Use --apply to actually set the password in the DB. Use --yes to skip confirmation."
    );
    process.exit(0);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const question = (q) =>
  new Promise((resolve) => {
    rl.question(q, (ans) => resolve(ans));
  });

const main = async () => {
  try {
    const pwd = generateKey(opts);
    console.log("Generated admin password:", pwd);
    console.log("Length:", pwd.length);
    console.log("Options:", opts);

    if (!identifier.id && !identifier.username && !identifier.email) {
      console.log(
        "No user identifier provided. This was a dry run. Use --id, --username or --email and --apply to set the password."
      );
      process.exit(0);
    }

    if (!apply) {
      console.log(
        "DRY RUN: To apply this password to the user, rerun with --apply"
      );
      console.log("Target:", identifier);
      process.exit(0);
    }

    // Apply path: connect to DB
    await connectDB();

    // find the user
    let user = null;
    if (identifier.id) user = await User.findById(identifier.id);
    else if (identifier.username)
      user = await User.findOne({
        username: identifier.username.toLowerCase(),
      });
    else if (identifier.email)
      user = await User.findOne({ email: identifier.email.toLowerCase() });

    if (!user) {
      console.error("User not found for:", identifier);
      await mongoose.disconnect();
      process.exit(2);
    }

    if (user.deletedAt) {
      console.error("User is deleted. Aborting.");
      await mongoose.disconnect();
      process.exit(2);
    }

    console.log(
      `About to set password for user: id=${user._id} username=${user.username} email=${user.email}`
    );

    if (!autoYes) {
      const ans = await question(
        "Confirm change password? (type 'yes' to proceed): "
      );
      if (ans.trim().toLowerCase() !== "yes") {
        console.log("Aborted by operator.");
        await mongoose.disconnect();
        process.exit(0);
      }
    }

    // set and save (pre-save hook will hash)
    user.password = pwd;
    await user.save();

    console.log("Password updated successfully for user:", user._id);
    console.log("New password:", pwd);

    await mongoose.disconnect();
    rl.close();
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    try {
      await mongoose.disconnect();
    } catch (e) {}
    rl.close();
    process.exit(1);
  }
};

main();
