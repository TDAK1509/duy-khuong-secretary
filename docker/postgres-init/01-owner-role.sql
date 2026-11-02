CREATE ROLE app_owner LOGIN PASSWORD 'app_owner';
CREATE DATABASE secretary OWNER app_owner;
