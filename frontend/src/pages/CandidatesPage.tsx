import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function CandidatesPage() {
  const qc = useQueryClient();
  const { data: list } = useQuery({
    queryKey: ['candidates'],
    queryFn: api.candidates.list,
  });
  const [fullName, setFullName] = useState('');
  const [phoneE164, setPhone] = useState('+54');
  const [email, setEmail] = useState('');

  const create = useMutation({
    mutationFn: api.candidates.create,
    onSuccess: () => {
      setFullName('');
      setPhone('+54');
      setEmail('');
      qc.invalidateQueries({ queryKey: ['candidates'] });
    },
  });

  return (
    <div>
      <h2>Candidatos</h2>
      <div className="card">
        <h3>Alta de candidato</h3>
        <label>Nombre completo</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <label>Teléfono E.164 (ej +5491155551234)</label>
        <input value={phoneE164} onChange={(e) => setPhone(e.target.value)} />
        <label>Email (opcional)</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
        <button
          disabled={!fullName || !phoneE164 || create.isPending}
          onClick={() =>
            create.mutate({ fullName, phoneE164, email: email || undefined })
          }
        >
          Crear
        </button>
        {create.error && <p style={{ color: '#b91c1c' }}>{String(create.error)}</p>}
      </div>

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Email</th>
          </tr>
        </thead>
        <tbody>
          {list?.map((c) => (
            <tr key={c.id}>
              <td>{c.fullName}</td>
              <td>{c.phoneE164}</td>
              <td>{c.email ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
