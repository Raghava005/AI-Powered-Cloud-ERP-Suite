import { Schema, model } from "mongoose";

const apInvoiceSchema = new Schema(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },

    vendorName: {
      type: String,
      required: true,
    },

    purchaseOrderId: {
      type: Schema.Types.ObjectId,
      ref: "PurchaseOrder",
    },

    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
    },

    invoiceAmount: {
      type: Number,
      required: true,
    },

    dueDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "PAID"],
      default: "PENDING",
    },
  },
  {
    timestamps: true,
  }
);

export const APInvoice = model(
  "APInvoice",
  apInvoiceSchema
);
apInvoiceSchema.index({ tenantId: 1, status: 1, createdAt: -1 });