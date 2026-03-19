import Anthropic from '@anthropic-ai/sdk';
import { SkillLoader } from '@/src/services/skill-loader';

export interface LearningResource {
  title: string;
  url: string;
  type: 'documentation' | 'article' | 'tutorial' | 'video' | 'reference';
  relevance: string;
}

export interface TechnicalDecision {
  id: string;
  title: string;
  description: string;
  category: 'architecture' | 'technology' | 'pattern' | 'tradeoff' | 'security' | 'performance';
  resources: LearningResource[];
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  relatedDecisionId: string;
}

export interface EducatorQuiz {
  passingScore: number;
  questions: QuizQuestion[];
}

export interface EducatorOutput {
  decisions: TechnicalDecision[];
  quiz: EducatorQuiz;
}

export interface QuizResult {
  passed: boolean;
  score: number;
  total: number;
  passingScore: number;
  answers: Array<{
    questionId: string;
    selectedIndex: number;
    correctIndex: number;
    correct: boolean;
    explanation: string;
  }>;
}

export class EducatorAgent {
  /**
   * Analyze a pipeline artifact and generate learning resources + quiz.
   */
  static async analyze(
    artifactContent: string,
    stageName: string,
    client: Anthropic
  ): Promise<EducatorOutput> {
    const systemPrompt = SkillLoader.getSkillPrompt('educator');

    console.log(`[EducatorAgent] Analyzing decisions from stage: ${stageName}`);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Analyze the technical decisions in this "${stageName}" stage output and generate learning resources and a quiz:\n\n${artifactContent}`,
        },
      ],
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    // Parse JSON — handle markdown-wrapped responses
    let result: EducatorOutput;
    try {
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
      result = JSON.parse(jsonMatch[1] || text);
    } catch {
      console.error('[EducatorAgent] Failed to parse JSON:', text.substring(0, 500));
      throw new Error('Educator agent returned invalid JSON');
    }

    // Validate basic structure
    if (!result.decisions || !result.quiz || !result.quiz.questions) {
      throw new Error('Educator output missing required fields');
    }

    console.log(
      `[EducatorAgent] Generated ${result.decisions.length} decisions, ${result.quiz.questions.length} questions (passing: ${result.quiz.passingScore})`
    );

    return result;
  }

  /**
   * Grade quiz answers and determine if the user passes.
   */
  static gradeQuiz(
    quiz: EducatorQuiz,
    answers: Record<string, number> // questionId → selected option index
  ): QuizResult {
    const results: QuizResult['answers'] = [];
    let correct = 0;

    for (const question of quiz.questions) {
      const selectedIndex = answers[question.id];
      const isCorrect = selectedIndex === question.correctIndex;
      if (isCorrect) correct++;

      results.push({
        questionId: question.id,
        selectedIndex: selectedIndex ?? -1,
        correctIndex: question.correctIndex,
        correct: isCorrect,
        explanation: question.explanation,
      });
    }

    return {
      passed: correct >= quiz.passingScore,
      score: correct,
      total: quiz.questions.length,
      passingScore: quiz.passingScore,
      answers: results,
    };
  }
}
