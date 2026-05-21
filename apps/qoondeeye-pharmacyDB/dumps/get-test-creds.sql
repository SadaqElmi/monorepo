SELECT t.schema_name, t.name, d.domain
FROM public."Tenant" t
LEFT JOIN public."Domain" d ON d.tenant_id = t.id
LIMIT 5;

SELECT email, role FROM wakiil.users LIMIT 3;
