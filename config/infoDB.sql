SELECT `ndx`, `name`, `score`, `created`
FROM `rg_as_hallOfFame`
ORDER BY `ndx` DESC
LIMIT :limit
