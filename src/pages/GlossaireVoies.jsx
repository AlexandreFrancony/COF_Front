import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getVoies, getProfils, getPeuples } from '../utils/api';

const TYPE_LABELS = {
  profil: 'Voies de profil',
  peuple: 'Voies de peuple',
  prestige: 'Voies de prestige',
  custom: 'Voies personnalisées (homebrew)',
  mage: 'Voie du mage',
};

function ActionBadge({ type }) {
  if (!type) return null;
  const labels = { limitee: 'Limitée', action: 'Action', passive: 'Passive' };
  return <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text-secondary)]">{labels[type] || type}</span>;
}

function VoieEntry({ voie, subtitle, highlighted }) {
  const ref = useRef(null);

  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [highlighted]);

  return (
    <div
      ref={ref}
      id={`voie-${voie.id}`}
      className={`p-4 rounded-xl bg-[var(--bg-card)] border ${highlighted ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-[var(--border)]'}`}
    >
      <h3 className="font-semibold text-[var(--accent)]">
        {voie.name}
        {subtitle && <span className="ml-2 text-sm text-[var(--text-secondary)] font-normal">{subtitle}</span>}
      </h3>
      <div className="flex flex-col gap-3 mt-2">
        {voie.capacites?.map((c) => (
          <div key={c.id}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">Rang {c.rang} — {c.name}</span>
              {c.est_sort && <span className="text-xs text-[var(--accent)]">(sort)</span>}
              <ActionBadge type={c.action_type} />
            </div>
            {c.resume && (
              <p className="text-sm font-medium text-[var(--accent)] mt-0.5">{c.resume}</p>
            )}
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">{c.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GroupSection({ title, voies, defaultOpen, highlightedId, subtitleFor }) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (voies.some((v) => v.id === highlightedId)) setOpen(true);
  }, [highlightedId, voies]);

  if (voies.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--bg-input)] bg-[var(--bg-card)]"
      >
        <span className="font-medium text-sm">{title}</span>
        <span className="text-xs text-[var(--text-secondary)]">{voies.length} voie{voies.length > 1 ? 's' : ''} {open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="p-3 flex flex-col gap-3">
          {voies.map((v) => (
            <VoieEntry key={v.id} voie={v} subtitle={subtitleFor?.(v)} highlighted={v.id === highlightedId} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GlossaireVoies() {
  const [voies, setVoies] = useState([]);
  const [profils, setProfils] = useState([]);
  const [peuples, setPeuples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchParams] = useSearchParams();
  const highlightedId = searchParams.get('voie') ? Number(searchParams.get('voie')) : null;

  useEffect(() => {
    Promise.all([getVoies({}), getProfils(), getPeuples()])
      .then(([voiesData, profilsData, peuplesData]) => {
        setVoies(voiesData);
        setProfils(profilsData);
        setPeuples(peuplesData);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]" />
      </div>
    );
  }

  const searchLower = search.trim().toLowerCase();
  const matches = (v) => {
    if (!searchLower) return true;
    const profilName = profils.find((p) => p.id === v.profil_id)?.name || '';
    const peupleName = peuples.find((p) => p.id === v.peuple_id)?.name || '';
    return (
      v.name.toLowerCase().includes(searchLower) ||
      profilName.toLowerCase().includes(searchLower) ||
      peupleName.toLowerCase().includes(searchLower) ||
      (v.origine_pj || '').toLowerCase().includes(searchLower) ||
      v.capacites?.some((c) => c.name.toLowerCase().includes(searchLower) || (c.resume || '').toLowerCase().includes(searchLower))
    );
  };

  const filtered = voies.filter(matches);
  const isSearching = searchLower.length > 0;

  const profilVoies = filtered.filter((v) => v.type === 'profil');
  const peupleVoies = filtered.filter((v) => v.type === 'peuple');
  const prestigeVoies = filtered.filter((v) => v.type === 'prestige');
  const customVoies = filtered.filter((v) => v.type === 'custom');
  const mageVoies = filtered.filter((v) => v.type === 'mage');

  const profilIds = [...new Set(profilVoies.map((v) => v.profil_id))].sort((a, b) =>
    (profils.find((p) => p.id === a)?.name || '').localeCompare(profils.find((p) => p.id === b)?.name || '')
  );

  return (
    <div className="p-6 max-w-4xl mx-auto flex flex-col gap-4">
      <div>
        <Link to="/campaigns" className="text-sm text-[var(--text-secondary)] hover:text-[var(--accent)]">
          ← Retour
        </Link>
        <h1 className="text-2xl font-bold text-[var(--accent)] mt-1">📖 Glossaire des voies</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Référence complète — chaque voie avec toutes ses capacités, non liée à un personnage.
        </p>
      </div>

      <input
        type="text"
        placeholder="Rechercher une voie, une capacité, un profil..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border)]"
      />

      {isSearching ? (
        filtered.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Aucun résultat.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((v) => (
              <VoieEntry
                key={v.id}
                voie={v}
                subtitle={
                  v.type === 'profil' ? profils.find((p) => p.id === v.profil_id)?.name
                    : v.type === 'peuple' ? peuples.find((p) => p.id === v.peuple_id)?.name
                    : v.type === 'custom' ? v.origine_pj
                    : TYPE_LABELS[v.type]
                }
                highlighted={v.id === highlightedId}
              />
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold">{TYPE_LABELS.profil}</h2>
          {profilIds.map((pid) => (
            <GroupSection
              key={pid}
              title={profils.find((p) => p.id === pid)?.name || '—'}
              voies={profilVoies.filter((v) => v.profil_id === pid)}
              defaultOpen={false}
              highlightedId={highlightedId}
            />
          ))}

          <h2 className="font-semibold mt-2">{TYPE_LABELS.peuple}</h2>
          <GroupSection
            title="Toutes"
            voies={peupleVoies}
            defaultOpen={false}
            highlightedId={highlightedId}
            subtitleFor={(v) => peuples.find((p) => p.id === v.peuple_id)?.name}
          />

          <h2 className="font-semibold mt-2">{TYPE_LABELS.mage}</h2>
          <GroupSection title="Voie du mage" voies={mageVoies} defaultOpen={false} highlightedId={highlightedId} />

          <h2 className="font-semibold mt-2">{TYPE_LABELS.custom}</h2>
          <GroupSection
            title="Toutes"
            voies={customVoies}
            defaultOpen={false}
            highlightedId={highlightedId}
            subtitleFor={(v) => v.origine_pj}
          />

          <h2 className="font-semibold mt-2">{TYPE_LABELS.prestige}</h2>
          <GroupSection title="Toutes" voies={prestigeVoies} defaultOpen={false} highlightedId={highlightedId} />
        </div>
      )}
    </div>
  );
}
