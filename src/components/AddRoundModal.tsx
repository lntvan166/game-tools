import React, { useState, useCallback } from 'react';
import { migrateRound } from '../lib/tienLenScore';
import type { RoundResult, Catch, CatchItem, LastWith, TienLenGame, CatchType } from '../lib/tienLenScore';

const CATCH_TYPE_LABELS: Record<CatchType, string> = {
  red2: 'Red 2',
  black2: 'Black 2',
  threePairs: 'Three pairs',
  fourPairs: 'Four pairs',
  fourOfKind: 'Four of a kind',
};

interface AddRoundModalProps {
  game: TienLenGame;
  onSave: (result: RoundResult, editIndex?: number) => void;
  onClose: () => void;
  initialRound?: RoundResult;
  editIndex?: number;
}

const AddRoundModal: React.FC<AddRoundModalProps> = ({ game, onSave, onClose, initialRound, editIndex }) => {
  const r = initialRound ? migrateRound(initialRound as unknown as Record<string, unknown>) : null;
  const [order, setOrder] = useState<string[]>(() => {
    if (r?.order?.length) {
      const valid = r.order.filter((id) => game.players.some((p) => p.id === id));
      if (valid.length === game.players.length) return valid;
    }
    return game.players.map((p) => p.id);
  });
  const [catchList, setCatchList] = useState<Catch[]>(() => r?.catch?.length ? [...r.catch] : []);
  const [lastList, setLastList] = useState<LastWith[]>(() => r?.last?.length ? [...r.last] : []);
  const [useCustomPoints, setUseCustomPoints] = useState(!!(r?.customPoints && Object.keys(r.customPoints).length > 0));
  const [customPoints, setCustomPoints] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    game.players.forEach((p) => (init[p.id] = r?.customPoints?.[p.id] ?? 0));
    return init;
  });
  const [isToiTrang, setIsToiTrang] = useState(!!r?.isToiTrang);
  const [winnerId, setWinnerId] = useState(r?.winnerId ?? '');
  const [rucCount, setRucCount] = useState(r?.rucCount ?? 0);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isNaN(fromIndex) || fromIndex === dropIndex) return;
    setOrder((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(dropIndex, 0, removed);
      return next;
    });
  }, []);

  const moveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((index: number) => {
    if (index >= order.length - 1) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, [order.length]);

  const addCatch = useCallback(() => {
    setCatchList((prev) => [...prev, { catcherId: '', victimId: '', items: [{ type: 'red2', qty: 1 }] }]);
  }, []);

  const addCatchItem = useCallback((catchIndex: number) => {
    setCatchList((prev) => {
      const next = [...prev];
      next[catchIndex] = { ...next[catchIndex], items: [...next[catchIndex].items, { type: 'red2', qty: 1 }] };
      return next;
    });
  }, []);

  const updateCatchItem = useCallback((catchIndex: number, itemIndex: number, field: keyof CatchItem, value: string | number) => {
    setCatchList((prev) => {
      const next = [...prev];
      const items = [...next[catchIndex].items];
      items[itemIndex] = { ...items[itemIndex], [field]: value };
      next[catchIndex] = { ...next[catchIndex], items };
      return next;
    });
  }, []);

  const removeCatchItem = useCallback((catchIndex: number, itemIndex: number) => {
    setCatchList((prev) => {
      const next = [...prev];
      const items = next[catchIndex].items.filter((_, i) => i !== itemIndex);
      if (items.length === 0) return prev.filter((_, i) => i !== catchIndex);
      next[catchIndex] = { ...next[catchIndex], items };
      return next;
    });
  }, []);

  const updateCatchPlayer = useCallback((catchIndex: number, field: 'catcherId' | 'victimId', value: string) => {
    setCatchList((prev) => {
      const next = [...prev];
      const c = next[catchIndex];
      next[catchIndex] = { ...c, [field]: value };
      if (field === 'catcherId' && c.victimId === value) {
        next[catchIndex].victimId = '';
      }
      return next;
    });
  }, []);

  const removeCatch = useCallback((index: number) => {
    setCatchList((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addLast = useCallback(() => {
    setLastList((prev) => [...prev, { playerId: '', type: 'red2' }]);
  }, []);

  const updateLast = useCallback((index: number, field: keyof LastWith, value: string) => {
    setLastList((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const removeLast = useCallback((index: number) => {
    setLastList((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCustomPointsChange = useCallback((playerId: string, value: number) => {
    setCustomPoints((prev) => ({ ...prev, [playerId]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (useCustomPoints) {
      onSave({
        order: game.players.map((p) => p.id),
        catch: [],
        last: [],
        customPoints: { ...customPoints },
      }, editIndex);
      return;
    }

    if (isToiTrang && winnerId) {
      onSave({
        order: [],
        catch: [],
        last: [],
        isToiTrang: true,
        winnerId,
      }, editIndex);
      return;
    }

    const validCatch = catchList.filter(
      (c) => c.catcherId && c.victimId && c.catcherId !== c.victimId && c.items.length > 0 && c.items.every((i) => i.qty > 0)
    ).map((c) => ({
      catcherId: c.catcherId,
      victimId: c.victimId,
      items: c.items.filter((i) => i.qty > 0),
    }));
    const validLast = lastList.filter((l) => l.playerId);

    const playerCount = game.players.length;
    if (order.length !== playerCount || new Set(order).size !== playerCount) return;

    onSave({
      order: [...order],
      catch: validCatch,
      last: validLast,
      rucCount: rucCount > 0 ? rucCount : undefined,
    }, editIndex);
  }, [order, catchList, lastList, useCustomPoints, customPoints, isToiTrang, winnerId, rucCount, game.players, onSave, editIndex]);

  const getPlayerName = (id: string) => game.players.find((p) => p.id === id)?.name ?? '?';

  const showOrderSection = !useCustomPoints && !isToiTrang;
  const showCatchLastSection = !useCustomPoints;

  return (
    <div className="score-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="add-round-title">
      <div className="score-modal score-add-round-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="add-round-title" className="score-modal-title">{editIndex !== undefined ? 'Edit round' : 'Round result'}</h2>

        <section className="score-modal-section">
          <label className="score-checkbox-row">
            <input type="checkbox" checked={useCustomPoints} onChange={(e) => setUseCustomPoints(e.target.checked)} />
            <span>Custom points (manual entry)</span>
          </label>
          <label className="score-checkbox-row">
            <input type="checkbox" checked={isToiTrang} onChange={(e) => setIsToiTrang(e.target.checked)} disabled={useCustomPoints} />
            <span>Sweep</span>
          </label>
        </section>

        {useCustomPoints && (
          <section className="score-modal-section">
            <h3>Points per player</h3>
            {game.players.map((p) => (
              <div key={p.id} className="score-custom-point-row">
                <span>{p.name}</span>
                <input
                  type="number"
                  value={customPoints[p.id] ?? 0}
                  onChange={(e) => handleCustomPointsChange(p.id, Number(e.target.value))}
                  className="score-input"
                />
              </div>
            ))}
          </section>
        )}

        {isToiTrang && !useCustomPoints && (
          <section className="score-modal-section">
            <h3>Winner (sweep)</h3>
            <select value={winnerId} onChange={(e) => setWinnerId(e.target.value)} className="score-input">
              <option value="">Select winner</option>
              {game.players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </section>
        )}

        {showOrderSection && (
          <section className="score-modal-section">
            <h3>Finish order (drag to reorder)</h3>
            <div className="score-ruc-select">
              <label>Stuck count:</label>
              <select value={rucCount} onChange={(e) => setRucCount(Number(e.target.value))}>
                {Array.from({ length: game.players.length }, (_, i) => (
                  <option key={i} value={i}>
                    {i}{i === game.players.length - 1 ? ' (sweep)' : ''}
                  </option>
                ))}
              </select>
            </div>
            {rucCount > 0 && (
              <p className="score-ruc-hint">Stuck = last {rucCount} in finish order</p>
            )}
            <div className="score-order-list">
              {order.map((playerId, index) => (
                <div
                  key={playerId}
                  className="score-order-item"
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  <span className="score-order-rank">{index + 1}</span>
                  <span className="score-order-name">{getPlayerName(playerId)}</span>
                  {rucCount > 0 && index >= order.length - rucCount && <span className="score-ruc-badge">stuck</span>}
                  <div className="score-order-buttons">
                    <button type="button" onClick={() => moveUp(index)} disabled={index === 0} aria-label="Move up">↑</button>
                    <button type="button" onClick={() => moveDown(index)} disabled={index === order.length - 1} aria-label="Move down">↓</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {showCatchLastSection && !isToiTrang && (
          <>
            <section className="score-modal-section">
              <h3>Catch (beat)</h3>
              {catchList.map((c, ci) => (
                <div key={ci} className="score-catch-block">
                  <div className="score-catch-catcher">
                    <select
                      value={c.catcherId}
                      onChange={(e) => updateCatchPlayer(ci, 'catcherId', e.target.value)}
                      aria-label="Catcher"
                    >
                      <option value="">Select catcher</option>
                      {game.players.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <span>beat</span>
                    <select
                      value={c.victimId}
                      onChange={(e) => updateCatchPlayer(ci, 'victimId', e.target.value)}
                      aria-label="Victim"
                    >
                      <option value="">Select victim</option>
                      {game.players.filter((p) => p.id !== c.catcherId).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {c.items.map((item, ii) => (
                    <div key={ii} className="score-catch-item-row">
                      <select
                        value={item.type}
                        onChange={(e) => updateCatchItem(ci, ii, 'type', e.target.value as CatchType)}
                      >
                        {(Object.keys(CATCH_TYPE_LABELS) as CatchType[]).map((t) => (
                          <option key={t} value={t}>{CATCH_TYPE_LABELS[t]}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={item.qty}
                        onChange={(e) => updateCatchItem(ci, ii, 'qty', Math.max(1, Number(e.target.value)))}
                        className="score-input score-qty-input"
                      />
                      <button type="button" className="score-catch-btn" onClick={() => removeCatchItem(ci, ii)} aria-label="Remove">× Remove</button>
                    </div>
                  ))}
                  <div className="score-catch-actions">
                    <button type="button" className="score-add-btn" onClick={() => addCatchItem(ci)}>+ Add card type</button>
                    <button type="button" className="score-catch-btn" onClick={() => removeCatch(ci)}>× Remove catch</button>
                  </div>
                </div>
              ))}
              <button type="button" className="score-add-btn" onClick={addCatch}>+ Add Catch</button>
            </section>

            <section className="score-modal-section">
              <h3>Last (holding)</h3>
              {lastList.map((l, i) => (
                <div key={i} className="score-last-row">
                  <select
                    value={l.playerId}
                    onChange={(e) => updateLast(i, 'playerId', e.target.value)}
                    aria-label="Player"
                  >
                    <option value="">Select player</option>
                    {game.players.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <select
                    value={l.type}
                    onChange={(e) => updateLast(i, 'type', e.target.value as CatchType)}
                  >
                    {(Object.keys(CATCH_TYPE_LABELS) as CatchType[]).map((t) => (
                      <option key={t} value={t}>{CATCH_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                  <button type="button" className="score-catch-btn" onClick={() => removeLast(i)} aria-label="Remove">× Remove</button>
                </div>
              ))}
              <button type="button" className="score-add-btn" onClick={addLast}>+ Add Last</button>
            </section>
          </>
        )}

        <div className="score-modal-actions">
          <button type="button" className="score-btn score-btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="score-btn score-btn-primary" onClick={handleSubmit}>{editIndex !== undefined ? 'Save' : 'Save Round'}</button>
        </div>
      </div>
    </div>
  );
};

export default AddRoundModal;
