import * as fc from 'fast-check';
import { BadRequestException } from '@nestjs/common';
import { IncidentWorkflowService } from '../incidents/incident-workflow.service';

describe('IncidentWorkflowService (Property-Based Tests)', () => {
  let workflow: IncidentWorkflowService;

  beforeAll(() => {
    workflow = new IncidentWorkflowService();
  });

  const allStatuses = [
    'DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'ASSIGNED', 'TRIAGE',
    'CONTAINMENT', 'INVESTIGATION', 'RCA_PENDING', 'CAPA_PENDING',
    'VERIFICATION', 'CLOSED', 'ARCHIVED',
  ];

  it('No dead ends except terminal states', () => {
    // For every valid state, it must either have allowed transitions or be terminal
    fc.assert(
      fc.property(fc.constantFrom(...allStatuses), (status) => {
        const allowed = workflow.getAllowedTransitions(status);
        if (workflow.isTerminal(status)) {
          return allowed.length === 0;
        } else {
          return allowed.length > 0;
        }
      })
    );
  });

  it('validateTransition throws if and only if the transition is invalid', () => {
    // Generate pairs of (fromState, toState)
    fc.assert(
      fc.property(
        fc.constantFrom(...allStatuses),
        fc.constantFrom(...allStatuses),
        (fromState, toState) => {
          const allowed = workflow.getAllowedTransitions(fromState);
          const isValid = allowed.includes(toState);

          if (isValid) {
            // Should not throw
            expect(() => workflow.validateTransition(fromState, toState)).not.toThrow();
          } else {
            // Should throw BadRequestException
            expect(() => workflow.validateTransition(fromState, toState)).toThrow(BadRequestException);
          }
          return true;
        }
      )
    );
  });

  it('Terminal states remain terminal (sink nodes)', () => {
    // A sink node has no outgoing edges
    const terminalStates = allStatuses.filter(s => workflow.isTerminal(s));
    fc.assert(
      fc.property(
        fc.constantFrom(...terminalStates),
        fc.constantFrom(...allStatuses),
        (terminalState, anyState) => {
          const allowed = workflow.getAllowedTransitions(terminalState);
          expect(allowed).toEqual([]);
          expect(() => workflow.validateTransition(terminalState, anyState)).toThrow();
          return true;
        }
      )
    );
  });

  it('stageLabel returns human readable names for all statuses', () => {
    fc.assert(
      fc.property(fc.constantFrom(...allStatuses), (status) => {
        const label = workflow.stageLabel(status);
        return typeof label === 'string' && label.length > 0 && label !== '';
      })
    );
  });
});
