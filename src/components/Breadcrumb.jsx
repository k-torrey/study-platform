import React from 'react';

export default function Breadcrumb({ crumbs }) {
  return (
    <nav className="breadcrumb">
      {crumbs.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="breadcrumb-sep">/</span>}
          <button
            className={`breadcrumb-item ${i === crumbs.length - 1 ? 'current' : ''}`}
            onClick={c.onClick}
            disabled={!c.onClick || i === crumbs.length - 1}
          >
            {c.label}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}
