atlas_projects = {
    "or": 18521,
    "wa": 166376,
}

schema = """
CREATE TABLE ina
CREATE TABLE project_observations (
    project_id int not null,
    observation_id int not null
);
CREATE INDEX observations_by_project ON project_observations (project_id);
"""

