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

  function handleFindInTextbook(term) {
    setTextbookSearchQuery(term);
    setActiveTab('textbook');
  }

  return (
    <div>
      <div className="page-header">
        <h2>{sectionName}</h2>
      </div>

      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'textbook' && (
        <TextbookTab
          sectionId={sectionId}
          courseId={courseId}
          initialQuery={textbookSearchQuery}
          onQueryConsumed={() => setTextbookSearchQuery('')}
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
