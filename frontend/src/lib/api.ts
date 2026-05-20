import axios from "axios";

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000",
});

export const startAutoOnboarding = async (payload: any) => {
  const { data } = await api.post("/auto-onboarding/start", payload);
  return data;
};

export const getRegistrarDomains = async (accountId: string) => {
  const { data } = await api.get(`/auto-onboarding/registrar-domains/${accountId}`);
  return data;
};

export const getAccounts = async () => {
  const { data } = await api.get("/accounts");
  return data;
};

export const createAccount = async (accountData: any) => {
  const { data } = await api.post("/accounts", accountData);
  return data;
};

export const syncAccount = async (id: string) => {
  const { data } = await api.post(`/accounts/${id}/sync`);
  return data;
};

export const deepSyncAccount = async (id: string) => {
  const { data } = await api.post(`/accounts/${id}/deep-sync`);
  return data;
};

export const deleteAccount = async (id: string) => {
  const { data } = await api.delete(`/accounts/${id}`);
  return data;
};

export const updateAccount = async (id: string, accountData: any) => {
  const { data } = await api.patch(`/accounts/${id}`, accountData);
  return data;
};

export const getDomains = async () => {

  const { data } = await api.get("/domains");
  return data;
};

export const massDeleteRecords = async (domainId: string, types?: string[]) => {
  const { data } = await api.post(`/domains/${domainId}/mass-delete`, { types });
  return data;
};

export const syncDomainRecords = async (domainId: string) => {
  const { data } = await api.post(`/domains/${domainId}/sync`);
  return data;
};

export const bulkMassDelete = async (domainNames: string[], types?: string[]) => {
  const { data } = await api.post(`/domains/bulk-mass-delete`, { domainNames, types });
  return data;
};

export const getJobStatus = async (jobId: string) => {
  const { data } = await api.get(`/domains/jobs/${jobId}`);
  return data;
};

export const getQueueStatus = async () => {
  const { data } = await api.get(`/domains/jobs/status`);
  return data;
};

export const clearAllJobs = async () => {
  const { data } = await api.post(`/domains/jobs/clear`);
  return data;
};

export const cancelBatch = async (batchId: string) => {
  const { data } = await api.post(`/domains/jobs/cancel/${batchId}`);
  return data;
};

export const pauseQueue = async () => {
  const { data } = await api.post(`/domains/jobs/pause`);
  return data;
};

export const resumeQueue = async () => {
  const { data } = await api.post(`/domains/jobs/resume`);
  return data;
};

export const getSyncBatches = async () => {
  const { data } = await api.get("/sync/batches");
  return data;
};

export const getActiveSyncBatchesCount = async () => {
  const { data } = await api.get("/sync/batches/active");
  return data;
};

export const getSyncBatchDetails = async (
  batchId: string,
  params?: { page?: number; limit?: number; status?: string; search?: string }
) => {
  const { data } = await api.get(`/sync/batches/${batchId}`, { params });
  return data;
};

export const getTaskSteps = async (taskId: string) => {
  const { data } = await api.get(`/sync/tasks/${taskId}`);
  return data;
};

export const cancelSyncBatch = async (batchId: string) => {
  const { data } = await api.post(`/sync/batches/${batchId}/cancel`);
  return data;
};

export default api;
