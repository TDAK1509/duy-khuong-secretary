CREATE ROLE app_owner LOGIN CREATEDB PASSWORD 'app_owner';
CREATE DATABASE secretary OWNER app_owner;
