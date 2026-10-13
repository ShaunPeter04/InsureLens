import axios from 'axios';
import { serviceErrorMessage, validServiceResponse } from './serviceResilience';

axios.defaults.timeout = 20000;
axios.interceptors.response.use(response => {
  if (!validServiceResponse(response.config.url || '', response.config.method || 'get', response.data)) {
    const error = new Error('Incomplete service response');
    error.code = 'INVALID_RESPONSE';
    error.response = {data:{message:serviceErrorMessage(error)}};
    return Promise.reject(error);
  }
  return response;
}, error => {
  // Normalize transport errors so existing pages display useful messages without losing forms.
  error.response = {...error.response, data:{...(error.response?.data && typeof error.response.data === "object" && !Array.isArray(error.response.data) ? error.response.data : {}), message:serviceErrorMessage(error)}};
  return Promise.reject(error);
});
