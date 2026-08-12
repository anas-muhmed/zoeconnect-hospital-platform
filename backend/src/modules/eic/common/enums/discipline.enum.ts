export enum EicDiscipline {
  BT        = 'BT',        // Behaviour Therapy
  SLP       = 'SLP',       // Speech-Language Pathology
  DT        = 'DT',        // Developmental Therapy
  OT        = 'OT',        // Occupational Therapy
  SE        = 'SE',        // Special Education
  PRESCHOOL = 'PRESCHOOL', // Preschool section
}

export const DISCIPLINE_LABELS: Record<EicDiscipline, string> = {
  [EicDiscipline.BT]:        'Behaviour Therapy',
  [EicDiscipline.SLP]:       'Speech-Language Pathology',
  [EicDiscipline.DT]:        'Developmental Therapy',
  [EicDiscipline.OT]:        'Occupational Therapy',
  [EicDiscipline.SE]:        'Special Education',
  [EicDiscipline.PRESCHOOL]: 'Preschool',
};
