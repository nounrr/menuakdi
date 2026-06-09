import dotenv from 'dotenv';
import { createServerConnection, dbConfig } from '../src/db.js';

dotenv.config();

const database = dbConfig.database;

const schema = `
CREATE DATABASE IF NOT EXISTS \`${database}\`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE \`${database}\`;

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name_fr VARCHAR(160) NOT NULL,
  name_ar VARCHAR(160) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_category_name (name_fr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subcategories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name_fr VARCHAR(160) NOT NULL,
  name_ar VARCHAR(160) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_subcategory_name (category_id, name_fr),
  CONSTRAINT fk_subcategories_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dishes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NULL,
  subcategory_id INT NULL,
  name_fr VARCHAR(220) NOT NULL,
  name_ar VARCHAR(220) NULL,
  description_fr TEXT NULL,
  description_ar TEXT NULL,
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  note VARCHAR(255) NULL,
  image_url VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dish_import (category_id, subcategory_id, name_fr),
  CONSTRAINT fk_dishes_category
    FOREIGN KEY (category_id) REFERENCES categories(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_dishes_subcategory
    FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin') NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const conn = await createServerConnection();
try {
  await conn.query(schema);
  console.log(`Base de donnees prete: ${database}`);
} finally {
  await conn.end();
}
