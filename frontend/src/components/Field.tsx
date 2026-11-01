import React from 'react';

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/** Rótulo visível + dica + erro logo abaixo do campo. O campo deve usar o mesmo `id`. */
export default function Field({ id, label, required, hint, error, className = '', children }: FieldProps) {
  return (
    <div className={`form-group !mb-0 ${className}`}>
      <label htmlFor={id} className="label">
        {label}
        {required ? <span className="text-red-700" aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p className="hint" id={`${id}-hint`}>{hint}</p> : null}
      {error ? <p className="field-error" id={`${id}-error`} role="alert">{error}</p> : null}
    </div>
  );
}
