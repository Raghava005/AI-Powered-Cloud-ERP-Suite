import dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";

import { connectDB } from "../../../database/db";
import { redisConnection } from "../../../config/redis";

import {
  generateReportPDF,
  generateReportCSV,
} from "../services/report.service";

import { sendEmail } from "../../notifications/services/email.service";

import { ReportSchedule } from "../models/reportSchedule.model";

connectDB();

new Worker(
  "reportQueue",

  async (job) => {
    const {
      tenantId,
      reportType,
      format,
      recipientEmail,
      filters,
      scheduleId,
    } = job.data;

    console.log(
      `[report-worker] Generating ${format} report: ${reportType}`
    );

    if (format === "excel") {
      const csv = await generateReportCSV(
        tenantId,
        reportType,
        filters
      );

      await sendEmail(
        recipientEmail,
        `ERP Report: ${reportType}`,
        `Your scheduled report:\n\n${csv}`
      );

    } else {
      const pdfBuffer = await generateReportPDF(
        tenantId,
        reportType,
        filters
      );

      await sendEmail(
        recipientEmail,
        `ERP Report: ${reportType}`,
        `Your scheduled ${reportType} report has been generated. ` +
          `PDF size: ${pdfBuffer.length} bytes.`
      );
    }

    if (scheduleId) {
      await ReportSchedule.findByIdAndUpdate(
        scheduleId,
        { lastRunAt: new Date() }
      );
    }

    console.log(
      `[report-worker] Report sent to ${recipientEmail}`
    );
  },

  {
    connection: redisConnection,
  }
);