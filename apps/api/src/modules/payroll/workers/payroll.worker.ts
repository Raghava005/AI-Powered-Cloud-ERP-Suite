import dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";

import { connectDB } from "../../../database/db";
import { redisConnection } from "../../../config/redis";

import { createLedgerEntry } from "../../finance/services/ledger.service";
import { Employee } from "../../hr/models/employee.model";
import { Payroll } from "../models/payroll.model";

connectDB();

new Worker(
  "payrollQueue",

  async (job) => {
    const { tenantId, employeeId, month, year, deductions, bonus } = job.data;

    console.log(
      "Processing payroll:",
      job.data
    );

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      console.error(`Payroll: employee ${employeeId} not found, skipping`);
      return;
    }

    const basicSalary = employee.salary || 0;
    const netSalary = basicSalary - (deductions || 0) + (bonus || 0);

    await Payroll.create({
      tenantId,
      employeeId,
      month,
      year,
      basicSalary,
      deductions: deductions || 0,
      bonus: bonus || 0,
      netSalary,
      status: "PAID",
    });

    // create finance ledger entry
    await createLedgerEntry({
      tenantId,
      referenceType: "PAYROLL",
      referenceId: employeeId,
      description: "Salary processed via payroll",
      debit: deductions || 0,
      credit: bonus || 0,
    });

    console.log("Payroll completed");
  },

  {
    connection: redisConnection,
  }
);