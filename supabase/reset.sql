-- ATENÇÃO: DESTRUTIVO. Apaga todas as tabelas do app (e seus dados) para uma
-- instalação limpa. Use só se as tabelas existentes forem sobras de uma tentativa
-- anterior e não tiverem dados que importem. Depois rode 0001_schema.sql e seed.sql.
drop table if exists fechamentos cascade;
drop table if exists historico cascade;
drop table if exists demandas cascade;
drop table if exists perfis cascade;
drop table if exists expedidores cascade;
drop table if exists equipamentos cascade;
drop table if exists clientes cascade;
drop table if exists veiculos cascade;
drop table if exists tecnicos cascade;
drop function if exists public.registrar_historico() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.criar_perfil_novo_usuario() cascade;
drop function if exists public.papel_atual() cascade;
drop function if exists public.reordenar_paradas(uuid[]) cascade;
