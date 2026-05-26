const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface Job {
  id: string;
  title: string;
  description: string;
  companyName: string;
  companyDescription: string;
  salaryRange: string;
  language: string;
  voiceId: string | null;
  questions?: Question[];
}

export interface Question {
  id: string;
  jobId: string;
  order: number;
  text: string;
  rubricText: string;
  maxScore: number;
}

export interface Candidate {
  id: string;
  fullName: string;
  phoneE164: string;
  email: string | null;
  notes: string | null;
}

export interface Interview {
  id: string;
  jobId: string;
  candidateId: string;
  status:
    | 'scheduled'
    | 'dialing'
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'no_answer';
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  overallScore: number | null;
  summary: string | null;
  job?: Job;
  candidate?: Candidate;
  turns?: {
    id: string;
    question?: Question;
    candidateResponseText: string | null;
    score: number | null;
    scoreJustification: string | null;
    askedAt: string;
  }[];
}

export const api = {
  jobs: {
    list: () => req<Job[]>('/jobs'),
    get: (id: string) => req<Job>(`/jobs/${id}`),
    create: (body: {
      title: string;
      description?: string;
      companyName?: string;
      companyDescription?: string;
      salaryRange?: string;
      voiceId?: string;
    }) =>
      req<Job>('/jobs', { method: 'POST', body: JSON.stringify(body) }),
    addQuestion: (
      jobId: string,
      body: { text: string; rubricText: string; order: number },
    ) =>
      req<Question>(`/jobs/${jobId}/questions`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  candidates: {
    list: () => req<Candidate[]>('/candidates'),
    create: (body: {
      fullName: string;
      phoneE164: string;
      email?: string;
      notes?: string;
    }) =>
      req<Candidate>('/candidates', { method: 'POST', body: JSON.stringify(body) }),
  },
  interviews: {
    list: () => req<Interview[]>('/interviews'),
    get: (id: string) => req<Interview>(`/interviews/${id}`),
    schedule: (body: {
      jobId: string;
      candidateId: string;
      scheduledAt: string;
    }) =>
      req<Interview>('/interviews', { method: 'POST', body: JSON.stringify(body) }),
    cancel: (id: string) =>
      req<Interview>(`/interviews/${id}/cancel`, { method: 'POST' }),
  },
};
