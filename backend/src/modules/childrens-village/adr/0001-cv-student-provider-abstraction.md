# 1. CV Student Provider Abstraction

Date: 2026-08-02
Status: Accepted

## Context
Children's Village (CV) needs to operate in two distinct environments:
1. Integrated seamlessly into the existing Oracle HIS system (pulling student demographics from Oracle patients).
2. As a standalone SaaS module for external clinics/schools (managing its own student database).

Directly querying Oracle tables would break the standalone use case, whereas building an entirely independent student database and attempting to sync it with Oracle would create data duplication and synchronization nightmares.

## Decision
We introduced the `CVStudentProvider` interface, which abstracts all student data retrieval and persistence. 

- **OracleHisStudentProvider**: Reads demographics dynamically from the hospital database.
- **InternalStudentProvider**: Reads/writes to a native `cv_students` table for standalone environments.

## Consequences
- **Positive**: Complete decoupling from Oracle. The module is fully independent.
- **Positive**: Clean abstraction. The rest of the module (attendance, IEP, curriculum) interacts solely with the interface.
- **Negative**: Adds a slight layer of complexity when resolving relations, as standard TypeORM relationships to the "Student" entity cannot be strictly enforced at the database level when using the Oracle provider.
