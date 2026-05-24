import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { data: job } = useQuery({
    queryKey: ['job', id],
    queryFn: () => api.jobs.get(id!),
    enabled: !!id,
  });

  const [text, setText] = useState('');
  const [rubricText, setRubricText] = useState('');

  const addQ = useMutation({
    mutationFn: (body: { text: string; rubricText: string; order: number }) =>
      api.jobs.addQuestion(id!, body),
    onSuccess: () => {
      setText('');
      setRubricText('');
      qc.invalidateQueries({ queryKey: ['job', id] });
    },
  });

  if (!job) return <p>Cargando…</p>;

  const nextOrder = (job.questions?.length ?? 0);

  return (
    <div>
      <h2>{job.title}</h2>
      <p>{job.description}</p>

      <div className="card">
        <h3>Nueva pregunta</h3>
        <label>Texto de la pregunta</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} />
        <label>Rúbrica (criterios para puntuar 1-5)</label>
        <textarea
          value={rubricText}
          onChange={(e) => setRubricText(e.target.value)}
          rows={4}
        />
        <button
          disabled={!text || !rubricText || addQ.isPending}
          onClick={() => addQ.mutate({ text, rubricText, order: nextOrder })}
        >
          Agregar
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Pregunta</th>
            <th>Rúbrica</th>
          </tr>
        </thead>
        <tbody>
          {job.questions?.map((q) => (
            <tr key={q.id}>
              <td>{q.order + 1}</td>
              <td>{q.text}</td>
              <td style={{ whiteSpace: 'pre-wrap' }}>{q.rubricText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
