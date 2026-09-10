import api from './api';

export const authService = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  googleAuth: (payload) => {
    const data = typeof payload === 'string' ? { credential: payload } : payload;
    return api.post('/auth/google', data);
  },
  getMe: () => api.get('/auth/me'),
  uploadAvatar: (payload) => {
    if (payload instanceof FormData) {
      return api.post('/auth/profile/avatar', payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }
    return api.post('/auth/profile/avatar', payload);
  },
};



