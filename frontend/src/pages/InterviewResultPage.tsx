import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function InterviewResultPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useQuery({
    queryKey: ['interview', id],
    queryFn: () => api.interviews.get(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status && status !== 'completed' && status !== 'failed' ? 3000 : false;
    },
  });

  if (!data) return <p>Cargando…</p>;

  return (
    <div>
      <h2>
        {data.candidate?.fullName} — {data.job?.title}
      </h2>
      <p>
        <span className={`badge ${data.status}`}>{data.status}</span>{' '}
        · Agendada: {new Date(data.scheduledAt).toLocaleString()}
        {data.overallScore != null && (
          <>
            {' '}
            · <strong>Score promedio: {data.overallScore.toFixed(2)}</strong>
          </>
        )}
      </p>

      {data.summary && (
        <div className="card">
          <h3>Resumen</h3>
          <p>{data.summary}</p>
        </div>
      )}

      <h3>Respuestas</h3>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Pregunta</th>
            <th>Respuesta</th>
            <th>Score</th>
            <th>Justificación</th>
          </tr>
        </thead>
        <tbody>
          {data.turns?.map((t, i) => (
            <tr key={t.id}>
              <td>{i + 1}</td>
              <td>{t.question?.text ?? '—'}</td>
              <td>{t.candidateResponseText ?? '—'}</td>
              <td>{t.score ?? '—'}</td>
              <td>{t.scoreJustification ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
