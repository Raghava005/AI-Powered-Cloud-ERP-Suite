import dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";

import { connectDB } from "../../../database/db";
import { redisConnection } from "../../../config/redis";

import {
  callMLTrain,
  callMLRetrainJob,
  invalidateForecastCache,
} from "../services/forecasting.service";

connectDB();

new Worker(
  "forecastingQueue",

  async (job) => {

    const {
      sku,
      history,
      model_type,
      action,
    } = job.data;

    console.log(
      `[forecasting-worker] action=${action} SKU=${sku}`
    );

    if (action === "train") {
      const result = await callMLTrain(
        sku,
        history,
        model_type || "auto"
      );
      await invalidateForecastCache(sku);
      console.log(
        `[forecasting-worker] train done:`,
        result
      );
    }

    if (action === "retrain") {
      await callMLRetrainJob(
        sku,
        history,
        model_type || "auto"
      );
      await invalidateForecastCache(sku);
      console.log(
        `[forecasting-worker] retrain enqueued for SKU=${sku}`
      );
    }
  },

  {
    connection: redisConnection,
  }
);