import dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";

import { connectDB } from "../../../database/db";
import { redisConnection } from "../../../config/redis";
import { Tenant } from "../../auth/models/tenant.model";
import { runTenantScan } from "../services/anomalyDetection.service";
import { scheduleRecurringScan } from "../queues/anomalyScan.queue";

connectDB();

new Worker(
  "anomalyScanQueue",

  async () => {
    const tenants = await Tenant.find().select("_id").lean();

    for (const tenant of tenants) {
      const flags = await runTenantScan(tenant._id);
      console.log(
        `[anomaly-scan-worker] tenant ${tenant._id}: ${flags.length} anomalies flagged`
      );
    }
  },

  {
    connection: redisConnection,
  }
);

scheduleRecurringScan();
