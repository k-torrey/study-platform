import React, { useState, useEffect, useCallback } from 'react';
import { getStudyProgress } from '../api';
import StudyLauncher from './StudyLauncher';
import FlashcardSession from './FlashcardSession';
import LearnSession from './LearnSession';
import TestSession from './TestSession';
import DiagramQuiz from './DiagramQuiz';

export default function StudyTab({ sectionId }) {
  const [subMode, setSubMode] = useState('launcher');
  const [progress, setProgress] = useState(null);

  const loadProgress = useCallback(() => {
    getStudyProgress(sectionId).then(setProgress).catch(console.error);
  }, [sectionId]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const handleBack = () => {
    setSubMode('launcher');
    loadProgress();
  };

  if (!progress) return <div className="empty-msg">Loading study data...</div>;

  if (subMode === 'flashcard') {
    return <FlashcardSession sectionId={sectionId} onBack={handleBack} />;
  }
  if (subMode === 'learn') {
    return <LearnSession sectionId={sectionId} onBack={handleBack} />;
  }
  if (subMode === 'test') {
    return <TestSession sectionId={sectionId} onBack={handleBack} />;
  }
  if (subMode === 'diagrams') {
    return <DiagramQuiz sectionId={sectionId} onBack={handleBack} />;
  }

  return (
    <StudyLauncher
      sectionId={sectionId}
      progress={progress}
      onSelectMode={setSubMode}
      onProgressChange={loadProgress}
    />
  );
}
