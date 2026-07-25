import { Request, Response } from "express";

import { payrollQueue } from "../queues/payroll.queue";
import { Payroll } from "../models/payroll.model";

export const getPayrollRecords = async (
  req: Request,
  res: Response
) => {
  try {
    const user = (req as any).user;

    const records = await Payroll.find({ tenantId: user.tenantId })
      .populate("employeeId", "fullName employeeId department")
      .sort({ createdAt: -1 });
    res.json({ records });

  } catch (error: any) {
    res.status(500).json({
      message: error.message,
    });
  }
};

export const runPayroll = async (
  req: Request,
  res: Response
) => {
  
  try {

    const user = (req as any).user;

    const {
      employeeId,
      month,
      year,
      deductions,
      bonus,
    } = req.body;

    await payrollQueue.add(
      "runPayroll",
      {
        tenantId: user.tenantId,
        employeeId,
        month,
        year,
        deductions,
        bonus,
      },
      {
        attempts: 3,
      }
    );

    res.status(201).json({
      message: "Payroll job added to queue",
    });

  } catch (error: any) {
    res.status(500).json({
      message: error.message,
    });
  }
};