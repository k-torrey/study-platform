import React, { useState } from 'react';
import TabBar from './TabBar';
import TextbookTab from './TextbookTab';
import TermsTab from './TermsTab';
import StudyTab from './StudyTab';
import NotesTab from './NotesTab';
import ChatTab from './ChatTab';

const TABS = [
  { key: 'textbook', label: 'Textbook' },
  { key: 'terms', label: 'Terms' },
  { key: 'study', label: 'Study' },
  { key: 'notes', label: 'Notes' },
  { key: 'ask', label: 'Ask' },
];

export default function SectionPage({ sectionId, sectionName, courseId, onBack }) {
  const [activeTab, setActiveTab] = useState('terms');
  const [textbookSearchQuery, setTextbookSearchQuery] = useState('');
  const [activeTerm, setActiveTerm] = useState(null);
  const [returnToTermId, setReturnToTermId] = useState(null);

  function handleFindInTextbook(termId, termName) {
    setActiveTerm({ id: termId, term: termName });
    setReturnToTermId(termId);
    setTextbookSearchQuery(termName);
    setActiveTab('textbook');
  }

  function handleReturnToTerms() {
    setActiveTab('terms');
    setActiveTerm(null);
    if (returnToTermId) {
      setTimeout(() => {
        const el = document.getElementById(`term-${returnToTermId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>{sectionName}</h2>
      </div>

      <TabBar tabs={TABS} active={activeTab} onChange={(tab) => {
        setActiveTab(tab);
        if (tab !== 'textbook') setActiveTerm(null);
      }} />

      {activeTab === 'textbook' && (
        <>
          {returnToTermId && (
            <button className="btn btn-back-to-terms mb-4" onClick={handleReturnToTerms}>
              &larr; Back to Terms
            </button>
          )}
          <TextbookTab
            sectionId={sectionId}
            courseId={courseId}
            initialQuery={textbookSearchQuery}
            onQueryConsumed={() => setTextbookSearchQuery('')}
            activeTerm={activeTerm}
            onDefinitionSet={() => {
              setActiveTerm(null);
              handleReturnToTerms();
            }}
          />
        </>
      )}
      {activeTab === 'terms' && (
        <TermsTab sectionId={sectionId} courseId={courseId} onFindInTextbook={handleFindInTextbook} />
      )}
      {activeTab === 'study' && (
        <StudyTab sectionId={sectionId} />
      )}
      {activeTab === 'notes' && (
        <NotesTab sectionId={sectionId} />
      )}
      {activeTab === 'ask' && (
        <ChatTab courseId={courseId} />
      )}
    </div>
  );
}
