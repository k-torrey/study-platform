import React, { useState } from 'react';
import TabBar from './TabBar';
import TextbookTab from './TextbookTab';
import TermsTab from './TermsTab';
import StudyTab from './StudyTab';
import NotesTab from './NotesTab';

const TABS = [
  { key: 'textbook', label: 'Textbook' },
  { key: 'terms', label: 'Terms' },
  { key: 'study', label: 'Study' },
  { key: 'notes', label: 'Notes' },
];

export default function SectionPage({ sectionId, sectionName, courseId, onBack }) {
  const [activeTab, setActiveTab] = useState('terms');
  const [textbookSearchQuery, setTextbookSearchQuery] = useState('');
  const [activeTerm, setActiveTerm] = useState(null); // { id, term } when searching from a term

  function handleFindInTextbook(termId, termName) {
    setActiveTerm({ id: termId, term: termName });
    setTextbookSearchQuery(termName);
    setActiveTab('textbook');
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
        <TextbookTab
          sectionId={sectionId}
          courseId={courseId}
          initialQuery={textbookSearchQuery}
          onQueryConsumed={() => setTextbookSearchQuery('')}
          activeTerm={activeTerm}
          onDefinitionSet={() => setActiveTerm(null)}
        />
      )}
      {activeTab === 'terms' && (
        <TermsTab sectionId={sectionId} onFindInTextbook={handleFindInTextbook} />
      )}
      {activeTab === 'study' && (
        <StudyTab sectionId={sectionId} />
      )}
      {activeTab === 'notes' && (
        <NotesTab sectionId={sectionId} />
      )}
    </div>
  );
}
