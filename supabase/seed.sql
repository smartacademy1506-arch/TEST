-- Jeu de démonstration pour le développement LOCAL (supabase db reset). NE PAS exécuter en production.
-- 12 questions FICTIVES de démonstration, fondées sur le niveau lycée ; elles n'ont fait l'objet d'aucune relecture
-- disciplinaire réelle et ne doivent jamais être vendues ni présentées comme du contenu validé (CDC EDT-01).

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-00000000a001', 'demo-author@example.test'),
  ('00000000-0000-4000-8000-00000000a002', 'demo-reviewer@example.test'),
  ('00000000-0000-4000-8000-00000000a003', 'demo-lead@example.test')
on conflict do nothing;

insert into public.staff_roles(user_id, role) values
  ('00000000-0000-4000-8000-00000000a001', 'author'),
  ('00000000-0000-4000-8000-00000000a002', 'reviewer'),
  ('00000000-0000-4000-8000-00000000a003', 'pedagogy_lead')
on conflict do nothing;

-- Date d'examen inconnue : aucun compte à rebours (CDC EXM-01)
insert into public.exams(country, track, academic_year, date_status)
values ('CM', 'medicine', '2026-2027', 'unknown')
on conflict do nothing;

insert into public.skills(exam_id, code, label, domain)
select e.id, s.code, s.label, s.domain
from public.exams e,
  (values ('BIO-CELL', 'Biologie cellulaire', 'biologie'), ('BIO-GEN', 'Génétique', 'biologie'),
          ('CHI-SOL', 'Solutions et pH', 'chimie'), ('CHI-NOM', 'Nomenclature et formules', 'chimie'),
          ('PHY-CIN', 'Cinématique et forces', 'physique'), ('PHY-ELEC', 'Électricité et énergie', 'physique')) as s(code, label, domain)
where e.country = 'CM' and e.track = 'medicine' and e.academic_year = '2026-2027'
on conflict do nothing;

-- Prix de TEST (hypothèses du CDC §10.1), à remplacer avant toute vente
insert into public.offers(code, label, kind, price_xaf, duration_days, terms_version) values
  ('discovery', 'Découverte', 'discovery', 0, null, 'cgv-test-1'),
  ('pass30', 'Pass 30 jours (test)', 'pass_30d', 5000, 30, 'cgv-test-1')
on conflict do nothing;

do $seed$
declare
  v_exam uuid; v_q uuid; v_v uuid; v_skill uuid; q jsonb; opt jsonb; i int;
  author   uuid := '00000000-0000-4000-8000-00000000a001';
  reviewer uuid := '00000000-0000-4000-8000-00000000a002';
  approver uuid := '00000000-0000-4000-8000-00000000a003';
  qs jsonb := $json$[
   {"skill":"BIO-CELL","stem":"[DÉMO] Quel organite est le siège principal de la production d'ATP dans la cellule eucaryote ?","explanation":"La phosphorylation oxydative, qui produit l'essentiel de l'ATP, a lieu dans la mitochondrie.","options":[{"t":"La mitochondrie","ok":true},{"t":"L'appareil de Golgi"},{"t":"Le lysosome"},{"t":"Le réticulum endoplasmique lisse"}]},
   {"skill":"BIO-GEN","stem":"[DÉMO] Quel schéma est le plus typique d'une maladie récessive liée à l'X ?","explanation":"Un garçon n'a qu'un seul chromosome X : l'allèle récessif s'exprime. Les filles hétérozygotes sont conductrices.","options":[{"t":"Transmission de père en fils"},{"t":"Garçons atteints, filles conductrices","ok":true},{"t":"Atteinte égale des deux sexes à chaque génération"},{"t":"Aucune transmission par les femmes"}]},
   {"skill":"BIO-CELL","stem":"[DÉMO] Quelle molécule transporte principalement l'oxygène dans le sang ?","explanation":"L'hémoglobine des globules rouges fixe l'oxygène.","options":[{"t":"L'albumine"},{"t":"L'hémoglobine","ok":true},{"t":"Le fibrinogène"},{"t":"L'insuline"}]},
   {"skill":"BIO-CELL","stem":"[DÉMO] À quelle phase de la mitose les chromatides sœurs se séparent-elles ?","explanation":"À l'anaphase, les chromatides sœurs migrent vers les pôles opposés de la cellule.","options":[{"t":"La prophase"},{"t":"La métaphase"},{"t":"L'anaphase","ok":true},{"t":"La télophase"}]},
   {"skill":"CHI-SOL","stem":"[DÉMO] Quel est le pH d'une solution d'acide chlorhydrique (acide fort) à 0,01 mol/L ?","explanation":"pH = −log[H3O+] = −log(10^−2) = 2.","options":[{"t":"1"},{"t":"2","ok":true},{"t":"3"},{"t":"12"}]},
   {"skill":"CHI-NOM","stem":"[DÉMO] Quelle est la formule du dioxyde de carbone ?","explanation":"Une molécule de dioxyde de carbone contient un atome de carbone et deux atomes d'oxygène : CO2.","options":[{"t":"CO"},{"t":"CO2","ok":true},{"t":"C2O"},{"t":"CH4"}]},
   {"skill":"CHI-SOL","stem":"[DÉMO] Quelle est la masse molaire approximative de l'eau H2O (H = 1 g/mol ; O = 16 g/mol) ?","explanation":"M = 2 × 1 + 16 = 18 g/mol.","options":[{"t":"16 g/mol"},{"t":"17 g/mol"},{"t":"18 g/mol","ok":true},{"t":"20 g/mol"}]},
   {"skill":"CHI-NOM","stem":"[DÉMO] Quel est le nom de l'alcane de formule C3H8 ?","explanation":"Les alcanes de formule CnH2n+2 : avec n = 3, c'est le propane.","options":[{"t":"L'éthane"},{"t":"Le propane","ok":true},{"t":"Le butane"},{"t":"Le propène"}]},
   {"skill":"PHY-CIN","stem":"[DÉMO] Un mobile parcourt 120 m en 20 s à vitesse constante. Quelle est sa vitesse ?","explanation":"v = d / t = 120 / 20 = 6 m/s.","options":[{"t":"0,17 m/s"},{"t":"6 m/s","ok":true},{"t":"12 m/s"},{"t":"2 400 m/s"}]},
   {"skill":"PHY-CIN","stem":"[DÉMO] Quelle est l'unité de la force dans le Système international ?","explanation":"La force se mesure en newton (N).","options":[{"t":"Le joule"},{"t":"Le watt"},{"t":"Le newton","ok":true},{"t":"Le pascal"}]},
   {"skill":"PHY-ELEC","stem":"[DÉMO] Une résistance de 10 Ω est parcourue par un courant de 2 A. Quelle est la tension à ses bornes ?","explanation":"Loi d'Ohm : U = R × I = 10 × 2 = 20 V.","options":[{"t":"5 V"},{"t":"12 V"},{"t":"20 V","ok":true},{"t":"0,2 V"}]},
   {"skill":"PHY-ELEC","stem":"[DÉMO] Quelle grandeur physique s'exprime en joules ?","explanation":"Le joule est l'unité d'énergie (et de travail).","options":[{"t":"Une puissance"},{"t":"Une force"},{"t":"Une énergie","ok":true},{"t":"Une pression"}]}
  ]$json$;
begin
  select id into v_exam from public.exams where country = 'CM' and track = 'medicine' and academic_year = '2026-2027';
  for q in select value from jsonb_array_elements(qs) loop
    insert into public.questions(exam_id) values (v_exam) returning id into v_q;
    insert into public.question_versions(question_id, version, stem, explanation, state, author_id, rights_basis)
      values (v_q, 1, q->>'stem', q->>'explanation', 'draft', author, 'original') returning id into v_v;
    i := 0;
    for opt in select value from jsonb_array_elements(q->'options') loop
      i := i + 1;
      insert into public.options(question_version_id, position, body, is_correct)
        values (v_v, i, opt->>'t', coalesce((opt->>'ok')::boolean, false));
    end loop;
    select id into v_skill from public.skills where exam_id = v_exam and code = q->>'skill';
    insert into public.question_skills(question_version_id, skill_id, is_primary) values (v_v, v_skill, true);
    -- options ajoutées AVANT la publication : une version publiée est immuable
    update public.question_versions set state = 'published', reviewer_id = reviewer, approver_id = approver, published_at = now()
      where id = v_v;
  end loop;
end
$seed$;
