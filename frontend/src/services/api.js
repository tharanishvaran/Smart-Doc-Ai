import axios from 'axios';

const isProd = import.meta.env.PROD || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');
const envUrl = import.meta.env.VITE_API_BASE_URL;
// If hosted together in production, default to relative '/api' unless a separate explicit HTTPS backend is set
const rawBaseUrl = (envUrl && (!isProd || envUrl.startsWith('https://')))
  ? envUrl
  : (isProd ? '/api' : (envUrl || 'http://localhost:5000/api'));
const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000,
});

// Attach JWT token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

function stripAsterisks(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\*\*/g, '');
  }
  if (Array.isArray(obj)) {
    return obj.map(stripAsterisks);
  }
  if (obj !== null && typeof obj === 'object') {
    const cleaned = {};
    for (const key of Object.keys(obj)) {
      if (key.includes('token') || key === 'access_token' || key === 'refresh_token') {
        cleaned[key] = obj[key];
      } else {
        cleaned[key] = stripAsterisks(obj[key]);
      }
    }
    return cleaned;
  }
  return obj;
}

// Handle 401 globally and sanitize response data
api.interceptors.response.use(
  (response) => {
    if (response && response.data) {
      response.data = stripAsterisks(response.data);
    }
    return response;
  },
  (error) => {
    const isAuthRequest = error.config?.url?.includes('/auth/login') || error.config?.url?.includes('/auth/register');
    if (error.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
