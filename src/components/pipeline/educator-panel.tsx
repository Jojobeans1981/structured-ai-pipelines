'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/src/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Badge } from '@/src/components/ui/badge';
import type { EducatorOutput, QuizResult, TechnicalDecision, QuizQuestion } from '@/src/services/educator-agent';

interface EducatorPanelProps {
  runId: string;
  stageId: string;
  stageName: string;
  onQuizPassed: () => void;
  /** If true, quiz was already passed — show read-only */
  alreadyPassed?: boolean;
}

type PanelPhase = 'loading' | 'resources' | 'quiz' | 'results' | 'passed' | 'error';

const CATEGORY_COLORS: Record<string, string> = {
  architecture: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  technology: 'bg-green-500/10 text-green-500 border-green-500/20',
  pattern: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  tradeoff: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  security: 'bg-red-500/10 text-red-500 border-red-500/20',
  performance: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
};

const RESOURCE_ICONS: Record<string, string> = {
  documentation: '📄',
  article: '📰',
  tutorial: '🎓',
  video: '🎬',
  reference: '📚',
};

function DecisionCard({ decision }: { decision: TechnicalDecision }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border-l-4" style={{ borderLeftColor: 'hsl(var(--primary))' }}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{decision.title}</CardTitle>
          <Badge variant="outline" className={CATEGORY_COLORS[decision.category] || ''}>
            {decision.category}
          </Badge>
        </div>
        <CardDescription className="text-xs">{decision.description}</CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Resources to Review
            </p>
            {decision.resources.map((resource, i) => (
              <a
                key={i}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <span className="text-sm">{RESOURCE_ICONS[resource.type] || '📄'}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary truncate">{resource.title}</p>
                  <p className="text-xs text-muted-foreground">{resource.relevance}</p>
                </div>
              </a>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function QuizView({
  questions,
  onSubmit,
  submitting,
}: {
  questions: QuizQuestion[];
  onSubmit: (answers: Record<string, number>) => void;
  submitting: boolean;
}) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const allAnswered = questions.every((q) => selected[q.id] !== undefined);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-semibold">Comprehension Check</h3>
        <p className="text-sm text-muted-foreground">
          You must pass this quiz before the pipeline can advance.
        </p>
      </div>

      {questions.map((q, qi) => (
        <Card key={q.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {qi + 1}. {q.question}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {q.options.map((option, oi) => (
                <button
                  key={oi}
                  onClick={() => setSelected((prev) => ({ ...prev, [q.id]: oi }))}
                  className={`w-full text-left p-3 rounded-md border text-sm transition-colors ${
                    selected[q.id] === oi
                      ? 'border-primary bg-primary/5 font-medium'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Button
        className="w-full"
        disabled={!allAnswered || submitting}
        onClick={() => onSubmit(selected)}
      >
        {submitting ? 'Grading...' : 'Submit Answers'}
      </Button>
    </div>
  );
}

function ResultsView({
  result,
  questions,
  onRetry,
  onContinue,
}: {
  result: QuizResult;
  questions: QuizQuestion[];
  onRetry: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <div
          className={`inline-flex items-center justify-center w-20 h-20 rounded-full text-2xl font-bold mb-3 ${
            result.passed
              ? 'bg-green-500/10 text-green-500 border-2 border-green-500/30'
              : 'bg-red-500/10 text-red-500 border-2 border-red-500/30'
          }`}
        >
          {result.score}/{result.total}
        </div>
        <h3 className="text-lg font-semibold">
          {result.passed ? 'Quiz Passed!' : 'Not Quite — Review and Try Again'}
        </h3>
        <p className="text-sm text-muted-foreground">
          {result.passed
            ? 'You understand the technical decisions. Pipeline can advance.'
            : `You need ${result.passingScore} correct to pass. Review the explanations below.`}
        </p>
      </div>

      {result.answers.map((answer, i) => {
        const question = questions.find((q) => q.id === answer.questionId);
        if (!question) return null;

        return (
          <Card
            key={answer.questionId}
            className={`border-l-4 ${
              answer.correct ? 'border-l-green-500' : 'border-l-red-500'
            }`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {i + 1}. {question.question}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="text-sm">
                <span className="text-muted-foreground">Your answer: </span>
                <span className={answer.correct ? 'text-green-500' : 'text-red-500'}>
                  {question.options[answer.selectedIndex] || 'No answer'}
                </span>
              </div>
              {!answer.correct && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Correct answer: </span>
                  <span className="text-green-500">
                    {question.options[answer.correctIndex]}
                  </span>
                </div>
              )}
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                {answer.explanation}
              </div>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex gap-3">
        {result.passed ? (
          <Button className="w-full" onClick={onContinue}>
            Continue Pipeline
          </Button>
        ) : (
          <Button className="w-full" variant="outline" onClick={onRetry}>
            Review Resources and Retry
          </Button>
        )}
      </div>
    </div>
  );
}

export function EducatorPanel({
  runId,
  stageId,
  stageName,
  onQuizPassed,
  alreadyPassed,
}: EducatorPanelProps) {
  const [phase, setPhase] = useState<PanelPhase>(alreadyPassed ? 'passed' : 'loading');
  const [educatorData, setEducatorData] = useState<EducatorOutput | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (alreadyPassed) return;

    async function load() {
      try {
        const res = await fetch(`/api/pipeline/${runId}/stages/${stageId}/educator`);
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        setEducatorData(json.data);
        setPhase('resources');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load educator content');
        setPhase('error');
      }
    }

    load();
  }, [runId, stageId, alreadyPassed]);

  async function handleSubmitQuiz(answers: Record<string, number>) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/pipeline/${runId}/stages/${stageId}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const result: QuizResult = json.data;
      setQuizResult(result);
      setPhase('results');

      if (result.passed) {
        // Small delay so user sees the result before pipeline advances
        setTimeout(() => onQuizPassed(), 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit quiz');
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'passed') {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        Comprehension check passed for this stage.
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="text-center py-12">
        <div className="animate-pulse space-y-2">
          <div className="text-lg font-semibold">Analyzing Technical Decisions...</div>
          <div className="text-sm text-muted-foreground">
            The Educator Agent is reviewing {stageName} and preparing your learning resources.
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="text-center py-6 text-sm text-red-500">
        {error || 'Something went wrong'}
      </div>
    );
  }

  if (!educatorData) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Learn Before You Proceed</h2>
          <p className="text-sm text-muted-foreground">
            Review these technical decisions, then pass the quiz to continue.
          </p>
        </div>
        {phase === 'resources' && (
          <Button onClick={() => setPhase('quiz')}>
            Take Quiz ({educatorData.quiz.questions.length} questions)
          </Button>
        )}
      </div>

      {/* Resources phase */}
      {phase === 'resources' && (
        <div className="space-y-3">
          {educatorData.decisions.map((decision) => (
            <DecisionCard key={decision.id} decision={decision} />
          ))}
        </div>
      )}

      {/* Quiz phase */}
      {phase === 'quiz' && (
        <QuizView
          questions={educatorData.quiz.questions}
          onSubmit={handleSubmitQuiz}
          submitting={submitting}
        />
      )}

      {/* Results phase */}
      {phase === 'results' && quizResult && (
        <ResultsView
          result={quizResult}
          questions={educatorData.quiz.questions}
          onRetry={() => setPhase('resources')}
          onContinue={onQuizPassed}
        />
      )}
    </div>
  );
}
