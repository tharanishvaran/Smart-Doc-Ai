import api from './api';

const rawBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
const API_BASE_URL = rawBaseUrl.replace(/\/+$/, '');

export const chatService = {
  getSessions: () => api.get('/chat/sessions'),
  createSession: (title) => api.post('/chat/sessions', { title }),
  getSession: (id) => api.get(`/chat/sessions/${id}`),
  deleteSession: (id) => api.delete(`/chat/sessions/${id}`),
  ask: (payload) => api.post('/chat/ask', payload),
  transcribeAudio: (audioB64, mimeType, language) =>
    api.post('/chat/transcribe', { audio: audioB64, mime_type: mimeType, language }),

  /**
   * Streaming ask via SSE fetch.
   * Calls onChunk(text) for every token received.
   * Calls onDone({ sources, message_id, session_id }) when complete.
   * Calls onError(message) on failure.
   */
  askStream: async (payload, { onChunk, onDone, onError }) => {
    const token = localStorage.getItem('access_token');
    let response;
    try {
      response = await fetch(`${API_BASE_URL}/chat/ask-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      onError?.('Network error: ' + err.message);
      return;
    }

    if (!response.ok) {
      onError?.(`Server error ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process all complete SSE lines in buffer
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const jsonStr = trimmed.slice(6).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;
        try {
          const event = JSON.parse(jsonStr);
          if (event.type === 'chunk') {
            onChunk?.(event.text);
          } else if (event.type === 'done') {
            onDone?.(event);
          } else if (event.type === 'error') {
            onError?.(event.message);
          }
        } catch (_) { /* ignore malformed SSE lines */ }
      }
    }
  },
};

