export type JsonObject = Record<string, unknown>;

export type UnresolvedCase = {
  id: string;
  receiptText?: string;
  transactionText?: string;
  amount?: number;
  currency?: string;
  bookingDate?: string;
  metadata?: JsonObject;
};

export type SuggestionRunRequest = {
  cases: UnresolvedCase[];
};

export type AcceptedPostingRequest = {
  posting: JsonObject;
};

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
