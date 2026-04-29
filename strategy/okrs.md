# FutureFit AI — OKRs

## Data Objectives

### Objective 1: Establish standards for measuring and reporting customer outcomes on wages, job placement, and training program<>jobs match by scaling contractual commitments
- KR 1: Worker profiles matched to wage records, career recommendation tool updated, and wage data services based on this work is an offering for all customers; social post gets 1K+ views if publishing approved (NJ DOL) Mark/Sam
- KR 2: Candidate-to-placement outcomes data shared with CO Thrives partners [with 4+ survey satisfaction?]; Snowflake integration for MA mapped to this data structure Mark/Sam
- KR 3: Curriculum<>job "outcome match" score is a win for ActivateWork GitLab grant deadline in June and we've identified a path to usage for 3+ additional employer, training, or workforce customers in Q3; social post gets 1K+ views Mark/Sam

### Objective 2: Operationalize high learning rate, actionable data for internal & external stakeholders
- KR 1: Skills taxonomy nonsensical terms and carryover COVID artifacts removed; quality improvements on relevant technical skills for common jobs and AI contemporary skills added Pablo/Sabri
- KR 2: AI Coach V2 high value work (e.g. memory/persistence, proactive follow-up, voice, mobile text) prioritized, scoped, shipped, and used by 70 users / week across 10+ customers (currently 7 users / week across ~2 customers). Ariana/Sabri/Gabriel
- KR 3: LMI on top of Revelio data that provides trends in demand over time, geo, occupation, industry viewed by 3+ customers (old "data warehouse & data model" bucket of work) Mark/Sam
- KR 4: Engagement & conversion funnel metrics shared in All Hands by June and integrated in QBR template (old "data warehouse & data model" bucket of work) Mark/Sam

### Objective 3: Stable foundation for BI, recommenders, and PIRL established
- KR 1: All existing security vulnerabilities in the ffai-data repo are closed Mark
- KR 2: Intercom data added to data lake Mark/Sam
- KR 3: PIRL solved for with Heap <> user mapping or an alternative, new mechanism for individual-level reporting on user outcomes Mark/Sam
- KR 4: Nightly update to the gold layer of the data warehouse running without errors or alerts (old "data warehouse & data model" bucket of work) Mark/Sam
- KR 5: 5 out of 5 tasks in discovery spike decided and documented for Q3 implementation: Authentication (Cognito/CA instance), iframe vs React, BI tool "dashboards as code", tenant level views, and migration mechanics Mark/Sam

## Product Objectives

### Objective 1: Deliver for MA go-live; job seeker portal live July 1, employer portal live September 1
- KR 1: Snowflake integration live and passing PIRL compliance checks for MA job seeker portal Sam/Josh
- KR 2: Job seeker portal ready for MA launch in July: self-sign up & SSO Sam/Josh
- KR 3: Job seeker portal KR and roadmap updates confirmed with management (and MA team?) by April 10, 2026 Sam/Josh
- KR 4: Employer portal KR and roadmap updates confirmed with management (and MA team?) by April 24, 2026 Sam/Josh
- KR 5: Granular permissions completed to unblock multi-tenant deployments Sam/Josh
- KR 6: "Apply to job" saved data accessible to job seekers, coaches and administrators Sabri/Josh

### Objective 2: Enhance Build team velocity through data, AI-assisted workflows & UX investments
- KR 1: PMs and UX using Claude Code automations for 10 "small UI win" tickets by end of quarter Edwin/Josh
- KR 2: User journey maps complete for job seeker, staff, admin, and employer personas — integrates with Claude and used in at least one MA discovery session or employer portal scoping by April 30, 2026 Edwin
- KR 3: Networking study learnings shared on socials (CCI) Edwin

## Engineering Objectives

### Objective 1: Achieve SOC2 readiness; identify NIST and accessibility gaps for internal scoping and procurement
- KR 1: WCAG 2.2 AA accessibility gap documented and effort sized to inform 2H planning and described satisfactorily for procurement and GTM conversations Josh/Sabri
- KR 2: All critical and high-severity SOC2 vulnerabilities remediated to enable SOC2 Type 2 observation window starting in Q3 Josh/Mark
- KR 3: Gap analysis against chosen NIST framework generates path to a technical system security plan (SSP); go/no go decision on FedRamp, GovCloud, GovRamp authorization complete Josh

### Objective 2: Operate a reliable, scalable WCG integration
- KR 1: Manual processes for integration failures fully identified, documented, and implemented Josh/Wenjia
- KR 2: Identify and automate processes that can be automated and action the top 80% of the list Wenjia
- KR 3: Develop shared roadmap & incentives based on bugs and defects from original Empyra scope Katya

### Objective 3: Operational health visible and improving
- KR 1: Health dashboard deployed with page load times, system alarms, etc centrally monitored and in alignment with NIST framework Emmanuel
- KR 2: Increase the ratio and raw number of completed:committed features/projects per sprint from 18:26 to 18:21 Q2 → Q3 Will/Ariana
- KR 3: Implement Claude-automated "first-pass" fixes for 50% of incoming non-critical bugs Josh/Will
