import { useState, type FormEvent } from 'react';
import type { usePageEditor } from '../hooks/usePageEditor';

type Editor = ReturnType<typeof usePageEditor>;

interface Props {
  editor: Editor;
  /** Called by the "Load latest version" button after a save conflict */
  onReloadLatest: () => void;
  /** Leaves edit mode (reopens the document for normal viewing) */
  onDone: () => void;
}

/** "Move to page __" / "Swap with page __": a small number field with a button */
function PositionAction({ label, button, max, disabled, onSubmit }: {
  label: string;
  button: string;
  max: number;
  disabled: boolean;
  onSubmit: (position: number) => void;
}) {
  const [value, setValue] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const position = Number(value);
    if (value.trim() === '') return;
    onSubmit(position);
    setValue('');
  };
  return (
    <form className="position-action" onSubmit={submit}>
      <label>
        <span>{label}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Page"
          disabled={disabled}
        />
      </label>
      <button type="submit" className="button button--secondary button--small" disabled={disabled || value.trim() === ''}>
        {button}
      </button>
    </form>
  );
}

function OriginNote({ editor }: { editor: Editor }) {
  const { origin, currentPage } = editor;
  if (!origin) return null;
  if (origin.kind === 'blank') return <span className="edit-bar__origin">Inserted blank page</span>;
  if (origin.kind === 'copy') return <span className="edit-bar__origin">Copy of page {origin.page.toLocaleString()}</span>;
  if (origin.page === currentPage) return null;
  return <span className="edit-bar__origin">Originally page {origin.page.toLocaleString()}</span>;
}

/** Toolbar shown above the viewer once a document is open. */
export function PageEditToolbar({ editor, onReloadLatest, onDone }: Props) {
  const { editing, busy, changeCount, message } = editor;
  const disabled = busy !== null;

  if (!editing) {
    return (
      <div className="edit-bar">
        <div className="edit-bar__row">
          <button type="button" className="button button--secondary button--small" onClick={() => void editor.startEditing()} disabled={disabled}>
            {busy === 'preparing' ? 'Preparing' : 'Edit pages'}
          </button>
          <button type="button" className="button button--secondary button--small" onClick={() => void editor.findBlankPages()} disabled={disabled}>
            Find blank pages
          </button>
        </div>
        {message && <Message editor={editor} onReloadLatest={onReloadLatest} />}
      </div>
    );
  }

  return (
    <div className="edit-bar">
      <div className="edit-bar__row">
        <span className="edit-bar__page">
          <span>
            Page {editor.currentPage.toLocaleString()} of {editor.pageCount.toLocaleString()}
          </span>
          <OriginNote editor={editor} />
        </span>
        <div className="edit-bar__group" role="group" aria-label="Undo and redo">
          <button type="button" className="button button--secondary button--small" onClick={() => void editor.undo()} disabled={disabled || !editor.canUndo}>
            Undo
          </button>
          <button type="button" className="button button--secondary button--small" onClick={() => void editor.redo()} disabled={disabled || !editor.canRedo}>
            Redo
          </button>
        </div>
        {busy === 'working' && <span className="edit-bar__busy">Working</span>}

        <div className="edit-bar__save">
          {editor.hasUnsavedChanges ? (
            <>
              <span className="edit-bar__changes">
                {changeCount} unsaved {changeCount === 1 ? 'change' : 'changes'}
              </span>
              <button type="button" className="button button--secondary button--small" onClick={() => void editor.discard()} disabled={disabled}>
                Discard
              </button>
              <button type="button" className="button button--small" onClick={() => void editor.save()} disabled={disabled}>
                {busy === 'saving' ? 'Saving' : 'Save changes'}
              </button>
            </>
          ) : (
            <button type="button" className="button button--secondary button--small" onClick={onDone} disabled={disabled}>
              Done editing
            </button>
          )}
        </div>
      </div>

      <div className="edit-bar__row edit-bar__row--actions">
        <div className="edit-bar__group" role="group" aria-label="Change this page">
          <button type="button" className="button button--secondary button--small" onClick={() => void editor.rotateCurrentPage('left')} disabled={disabled}>
            Rotate left
          </button>
          <button type="button" className="button button--secondary button--small" onClick={() => void editor.rotateCurrentPage('right')} disabled={disabled}>
            Rotate right
          </button>
          <button type="button" className="button button--secondary button--small" onClick={() => void editor.duplicateCurrentPage()} disabled={disabled}>
            Duplicate
          </button>
          <button type="button" className="button button--danger-quiet button--small" onClick={() => void editor.deleteCurrentPage()} disabled={disabled}>
            Delete
          </button>
        </div>

        <span className="edit-bar__divider" aria-hidden="true" />
        <PositionAction label="Move to" button="Move" max={editor.pageCount} disabled={disabled} onSubmit={(p) => void editor.moveCurrentPageTo(p)} />
        <PositionAction label="Swap with" button="Swap" max={editor.pageCount} disabled={disabled} onSubmit={(p) => void editor.swapCurrentPageWith(p)} />

        <span className="edit-bar__divider" aria-hidden="true" />
        <div className="edit-bar__group" role="group" aria-label="Insert a blank page">
          <span className="edit-bar__label">Blank page</span>
          <button type="button" className="button button--secondary button--small" onClick={() => void editor.insertBlankPage('before')} disabled={disabled}>
            Before
          </button>
          <button type="button" className="button button--secondary button--small" onClick={() => void editor.insertBlankPage('after')} disabled={disabled}>
            After
          </button>
        </div>

        <button type="button" className="button button--secondary button--small edit-bar__find" onClick={() => void editor.findBlankPages()} disabled={disabled}>
          Find blank pages
        </button>
      </div>

      {message && <Message editor={editor} onReloadLatest={onReloadLatest} />}
    </div>
  );
}

function Message({ editor, onReloadLatest }: { editor: Editor; onReloadLatest: () => void }) {
  const { message } = editor;
  if (!message) return null;
  return (
    <p className={`edit-bar__message edit-bar__message--${message.kind}`} role={message.kind === 'success' ? 'status' : 'alert'}>
      <span>{message.text}</span>
      {message.kind === 'conflict' && (
        <button type="button" className="text-button" onClick={onReloadLatest}>
          Load latest version
        </button>
      )}
      <button type="button" className="text-button text-button--quiet" onClick={editor.clearMessage} aria-label="Dismiss message">
        Dismiss
      </button>
    </p>
  );
}
