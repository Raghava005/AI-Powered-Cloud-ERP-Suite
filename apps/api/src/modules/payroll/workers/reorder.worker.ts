import dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";

import { connectDB } from "../../../database/db";
import { redisConnection } from "../../../config/redis";

connectDB();

new Worker(
  "reorderQueue",

  async (job) => {
    console.log(
      "⚠️ Low stock detected:",
      job.data
    );

    // future:
    // auto-create PO
    // send email
    // notify admin
  },

  {
    connection: redisConnection,
  }
);