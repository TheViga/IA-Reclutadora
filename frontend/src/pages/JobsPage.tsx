import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function JobsPage() {
  const qc = useQueryClient();
  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: api.jobs.list });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: api.jobs.create,
    onSuccess: () => {
      setTitle('');
      setDescription('');
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  return (
    <div>
      <h2>Puestos</h2>
      <div className="card">
        <h3>Crear puesto</h3>
        <label>Título</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>Descripción</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
        <button
          disabled={!title || create.isPending}
          onClick={() => create.mutate({ title, description })}
        >
          Crear
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Descripción</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {jobs?.map((j) => (
            <tr key={j.id}>
              <td>{j.title}</td>
              <td>{j.description}</td>
              <td>
                <Link to={`/jobs/${j.id}`}>Ver / preguntas</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
