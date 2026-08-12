import { Injectable, Inject } from '@nestjs/common';
import { CVStudentProvider, UnifiedStudent, ListStudentsParams, ListStudentsResult } from '../interfaces/cv-student.interface';

@Injectable()
export class CvStudentSearchService {
  constructor(
    @Inject(CVStudentProvider)
    private readonly studentProvider: CVStudentProvider,
  ) {}

  async search(query: string): Promise<UnifiedStudent[]> {
    if (!query || query.length < 3) {
      return [];
    }
    return this.studentProvider.searchStudents(query);
  }

  /** Browse-by-default Student Directory listing -- see interface's doc comment. */
  async list(params: ListStudentsParams): Promise<ListStudentsResult> {
    return this.studentProvider.listStudents(params);
  }
}
