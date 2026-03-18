import React, { useState, useCallback } from 'react';
import { useAuth } from './auth';
import AuthPage from './components/AuthPage';
import Breadcrumb from './components/Breadcrumb';
import HomePage from './components/HomePage';
import CoursePage from './components/CoursePage';
import ExamPage from './components/ExamPage';
import SectionPage from './components/SectionPage';

export default function App() {
  const { user, loading, signOut, recoveryMode } = useAuth();

  const [nav, setNav] = useState({ view: 'home' });
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

  if (loading) {
    return (
      <div className="app">
        <div className="app-loading">Loading...</div>
      </div>
    );
  }

  // Show password reset form even if user has a session from the recovery token
  if (!user || recoveryMode) {
    return <AuthPage />;
  }

  const goHome = () => setNav({ view: 'home' });
  const goCourse = (courseId, courseName) => setNav({ view: 'course', courseId, courseName });
  const goExam = (examId, examName) => setNav({ ...nav, view: 'exam', examId, examName });
  const goSection = (sectionId, sectionName) => setNav({ ...nav, view: 'section', sectionId, sectionName });

  const crumbs = [{ label: 'Courses', onClick: goHome }];
  if (nav.view !== 'home') {
    crumbs.push({ label: nav.courseName || 'Course', onClick: () => goCourse(nav.courseId, nav.courseName) });
  }
  if (nav.view === 'exam' || nav.view === 'section') {
    crumbs.push({ label: nav.examName || 'Exam', onClick: () => goExam(nav.examId, nav.examName) });
  }
  if (nav.view === 'section') {
    crumbs.push({ label: nav.sectionName || 'Section' });
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={goHome} style={{ cursor: 'pointer' }}>Study</h1>
        <div className="header-right">
          <span className="header-email">{user.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <div className="app-body">
        {nav.view !== 'home' && <Breadcrumb crumbs={crumbs} />}

        {nav.view === 'home' && (
          <HomePage
            key={refreshKey}
            onSelectCourse={goCourse}
            onRefresh={refresh}
          />
        )}

        {nav.view === 'course' && (
          <CoursePage
            key={`${nav.courseId}-${refreshKey}`}
            courseId={nav.courseId}
            courseName={nav.courseName}
            onSelectExam={goExam}
            onRefresh={refresh}
            onBack={goHome}
          />
        )}

        {nav.view === 'exam' && (
          <ExamPage
            key={`${nav.examId}-${refreshKey}`}
            examId={nav.examId}
            examName={nav.examName}
            courseId={nav.courseId}
            onSelectSection={goSection}
            onRefresh={refresh}
            onBack={() => goCourse(nav.courseId, nav.courseName)}
          />
        )}

        {nav.view === 'section' && (
          <SectionPage
            key={nav.sectionId}
            sectionId={nav.sectionId}
            sectionName={nav.sectionName}
            courseId={nav.courseId}
            onBack={() => goExam(nav.examId, nav.examName)}
          />
        )}
      </div>
    </div>
  );
}
