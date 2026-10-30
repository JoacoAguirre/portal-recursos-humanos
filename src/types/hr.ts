export type EppItem = {
  id: string;
  name: string;
  description: string | null;
};

export type RequestHistoryEntry = {
  id: string;
  actor_id: string;
  previous_status: import("@/types/database").RequestStatus | null;
  new_status: import("@/types/database").RequestStatus;
  action: string;
  created_at: string;
};

export type RequestComment = {
  id: string;
  author_id: string;
  body: string;
  internal?: boolean;
  created_at: string;
};

export type AdminRequestRow = {
  id: string;
  employee_id: string;
  company_id: string;
  request_type: import("@/types/database").RequestType;
  status: import("@/types/database").RequestStatus;
  payload: Record<string, unknown>;
  created_at: string;
  version: number;
  employeeName: string;
  employeeNumber: string | null;
  companyName: string;
};
