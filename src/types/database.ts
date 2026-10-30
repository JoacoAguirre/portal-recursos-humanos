export type AppRole = "EMPLEADO" | "RRHH_ADMIN" | "SUPERADMIN";
export type RequestStatus =
  | "pending"
  | "in_review"
  | "observed"
  | "approved"
  | "rejected"
  | "cancelled";
export type RequestType = "leave" | "vacation" | "epp" | "personal_data" | "other";

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  contact_email: string | null;
  employee_number: string | null;
  company_id: string | null;
  department: string | null;
  position: string | null;
  phone: string | null;
  address: string | null;
  hire_date: string | null;
  onboarding_completed_at: string | null;
  employment_status: "active" | "inactive" | "leave";
  created_at: string;
  updated_at: string;
};

export type Company = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RequestRecord = {
  id: string;
  employee_id: string;
  company_id: string;
  request_type: RequestType;
  status: RequestStatus;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  version: number;
};

export type Database = {
  public: {
    Tables: {
      companies: Table<Company>;
      profiles: Table<Profile>;
      requests: Table<RequestRecord>;
      request_comments: Table<{
        id: string;
        request_id: string;
        author_id: string;
        body: string;
        internal: boolean;
        created_at: string;
      }>;
      request_history: Table<{
        id: string;
        request_id: string;
        actor_id: string;
        previous_status: RequestStatus | null;
        new_status: RequestStatus;
        action: string;
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
      employee_documents: Table<{
        id: string;
        employee_id: string;
        company_id: string;
        document_type: string;
        storage_path: string;
        issue_date: string | null;
        expiration_date: string | null;
        expiration_unknown: boolean;
        notes: string | null;
        active: boolean;
        created_by: string;
        created_at: string;
        updated_at: string;
      }>;
      epp_catalog: Table<{
        id: string;
        company_id: string | null;
        name: string;
        description: string | null;
        active: boolean;
        created_at: string;
      }>;
      notifications: Table<{
        id: string;
        user_id: string;
        title: string;
        message: string;
        type: "request" | "document" | "system";
        read_at: string | null;
        related_entity_id: string | null;
        dedupe_key: string | null;
        created_at: string;
      }>;
      personal_data_change_requests: Table<{
        id: string;
        employee_id: string;
        company_id: string;
        requested_data: Record<string, unknown>;
        status: RequestStatus;
        reviewed_by: string | null;
        reviewed_at: string | null;
        review_comment: string | null;
        created_at: string;
      }>;
      user_company_access: Table<{
        user_id: string;
        company_id: string;
        can_manage_employees: boolean;
        can_manage_documents: boolean;
        can_resolve_requests: boolean;
        created_at: string;
      }>;
      audit_logs: Table<{
        id: string;
        actor_id: string | null;
        company_id: string | null;
        action: string;
        entity_type: string;
        entity_id: string | null;
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      get_my_role: { Args: Record<string, never>; Returns: AppRole | null };
      complete_my_profile: {
        Args: {
          p_first_name: string;
          p_last_name: string;
          p_contact_email: string | null;
          p_phone: string | null;
          p_address: string | null;
        };
        Returns: undefined;
      };
      reopen_user_onboarding: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      create_employee_profile: {
        Args: {
          p_user_id: string;
          p_company_id: string;
          p_first_name: string;
          p_last_name: string;
          p_employee_number: string;
          p_department?: string | null;
          p_position?: string | null;
          p_phone?: string | null;
          p_address?: string | null;
          p_hire_date?: string | null;
        };
        Returns: Profile;
      };
      provision_hr_admin: {
        Args: {
          p_user_id: string;
          p_company_id: string;
          p_first_name: string;
          p_last_name: string;
          p_can_manage_employees?: boolean;
          p_can_manage_documents?: boolean;
          p_can_resolve_requests?: boolean;
        };
        Returns: Profile;
      };
      list_managed_users: {
        Args: Record<string, never>;
        Returns: { user_id: string; first_name: string; last_name: string; email: string; role: AppRole }[];
      };
      configure_user_company_access: {
        Args: {
          p_user_id: string;
          p_company_id: string;
          p_enabled: boolean;
          p_can_manage_employees?: boolean;
          p_can_manage_documents?: boolean;
          p_can_resolve_requests?: boolean;
        };
        Returns: undefined;
      };
      configure_user_role: {
        Args: { p_user_id: string; p_role: AppRole };
        Returns: undefined;
      };
      resolve_request: {
        Args: {
          p_request_id: string;
          p_expected_version: number;
          p_new_status: RequestStatus;
          p_comment?: string | null;
          p_internal_note?: string | null;
        };
        Returns: RequestRecord;
      };
      cancel_own_request: {
        Args: { p_request_id: string; p_expected_version: number };
        Returns: RequestRecord;
      };
      review_personal_data_change: {
        Args: { p_change_id: string; p_approve: boolean; p_comment?: string | null };
        Returns: Database["public"]["Tables"]["personal_data_change_requests"]["Row"];
      };
      enqueue_document_expiry_notifications: {
        Args: { p_time_zone?: string };
        Returns: number;
      };
    };
    Enums: {
      app_role: AppRole;
      employment_status: Profile["employment_status"];
      request_status: RequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
