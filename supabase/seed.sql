-- =====================================================================
-- Dados iniciais — Grupo Nova Opção
-- (veículos padrão marcados "confirmar" no plano devem ser revisados no cadastro)
-- =====================================================================

insert into veiculos (nome, placa) values
  ('FIORINO - SRT9D86', 'SRT9D86'),
  ('KIA - TTB0J08',     'TTB0J08'),
  ('SAVEIRO - TZG3B34', 'TZG3B34'),
  ('KIA - TTZ7I26',     'TTZ7I26'),
  ('FIORINO - SRT9D65', 'SRT9D65'),
  ('SCUDO - TTP8H79',   'TTP8H79'),
  ('STRADA - SRT9D55',  'SRT9D55'),
  ('KIA - TTX1H09',     'TTX1H09')
on conflict (nome) do nothing;

insert into tecnicos (nome, veiculo_padrao, cor) values
  ('Victor',            'FIORINO - SRT9D86', '#2563eb'),
  ('Igor',              'KIA - TTB0J08',     '#0d9488'),
  ('Alexandre',         'SAVEIRO - TZG3B34', '#7c3aed'),
  ('Rafael',            'KIA - TTZ7I26',     '#dc2626'),
  ('Leonardo Alves',    'FIORINO - SRT9D65', '#d97706'),
  ('Luiz Henrique',     'SCUDO - TTP8H79',   '#059669'),
  ('Leonardo Oliveira', 'STRADA - SRT9D55',  '#db2777'),
  ('Douglas',           'KIA - TTX1H09',     '#4b5563')
on conflict (nome) do nothing;

insert into expedidores (nome) values
  ('Silvio'), ('Adonai'), ('Hugo'), ('Arthur'), ('Outros')
on conflict (nome) do nothing;

insert into clientes (nome, apelidos) values
  ('ÁGUAS DO RIO',                  array['AEGEA','AEGEA SANEAMENTO','AGUAS DO RIO']),
  ('CONSTRUTORA AFFONSECA',         array['AFFONSECA','LYTORÂNEA','LYTORANEA']),
  ('R2X',                           array['R2X ENGENHARIA']),
  ('JC MORAES',                     array['JC MORAES CONSTRUÇÕES']),
  ('CONSÓRCIO SANEAMENTO MINEIRO',  array['SANEAMENTO MINEIRO','CSM']),
  ('CONSTRUTORA RJL2',              array['RJL2'])
on conflict (nome) do nothing;
