import api from './api';

const envUrl = (import.meta.env.VITE_API_BASE_URL || '').trim();
const rawBaseUrl = (envUrl && !envUrl.includes('localhost:5000')) ? envUrl : '/api';
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
    let doneDispatched = false;

    const parseLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) return;
      const jsonStr = trimmed.slice(6).trim();
      if (!jsonStr || jsonStr === '[DONE]') return;
      try {
        const event = JSON.parse(jsonStr);
        if (event.type === 'chunk') {
          onChunk?.(event.text);
        } else if (event.type === 'done') {
          doneDispatched = true;
          onDone?.(event);
        } else if (event.type === 'error') {
          onError?.(event.message);
        }
      } catch (_) { /* ignore malformed SSE lines */ }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Flush any final bytes from the decoder
          buffer += decoder.decode();
          if (buffer.trim()) {
            const finalLines = buffer.split('\n');
            for (const l of finalLines) {
              parseLine(l);
            }
          }
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        // Process all complete SSE lines in buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // keep incomplete last line

        for (const line of lines) {
          parseLine(line);
        }
      }
    } catch (err) {
      onError?.('Stream interrupted: ' + err.message);
    } finally {
      if (!doneDispatched) {
        doneDispatched = true;
        onDone?.({ sources: [] });
      }
    }
  },
};

