export type Project = {
  id: string;
  name: string;
  description: string;
  deletedYn?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  requestedByUserId?: string | null;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  createdAt: string;
};
