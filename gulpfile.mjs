import gulp from 'gulp';
import path from 'path';
import fs from 'fs';
import { globSync } from 'glob';
import log from 'fancy-log';
import rename from 'gulp-rename';
import { deleteAsync } from 'del';
import ejs from 'gulp-ejs';
import htmlmin from 'gulp-htmlmin';
import webpack from 'webpack-stream';
import postcss from 'gulp-postcss';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import * as dartSass from 'sass';
import gulpSass from 'gulp-sass';
import inject from 'gulp-inject-string';
import browserSync from 'browser-sync';

const { src, dest, watch: gulpwatch, series, parallel } = gulp;
const sass = gulpSass(dartSass);

const src_dir = './src/';
const pub_dir = './public/';

const htmlminopts = {
    collapse_boolean_attributes: true,
    collapse_whitespace: true,
    minify_css: true,
    minify_js: true,
    minify_urls: true,
    remove_empty_attributes: true,
    remove_redundant_attributes: true,
    remove_script_type_attributes: true,
    remove_style_link_type_attributes: true,
    sort_attributes: true,
    sort_class_name: true
};

const path_to = (from, where) => {
    if (from.endsWith('/')) {
        from = from.slice(0, -1);
    }
    if (where.startsWith('/')) {
        where = where.slice(1);
    }

    return `${from}/${where}`;
};

const src_path_to = (where) => {
    return path_to(src_dir, where);
};

const pub_path_to = (where) => {
    return path_to(pub_dir, where);
};

const glob_pattern = (dir, ext) => {
    if (ext === '') {
        ext = dir;
    }
    return `${dir}/**/*.${ext}`;
};

const src_glob = (dir, ext = '') => {
    return src_path_to(glob_pattern(dir, ext));
};

const readJSON = (path) => {
    return JSON.parse(fs.readFileSync(path, { encoding: 'utf8', flag: 'r' }));
};

const readConfig = () => {
    let config = {
        dist: {
            js: [
                {
                    src: 'dist/main.bundle.js',
                    defer: true
                }
            ],
            css: [
                {
                    src: 'dist/main.css'
                }
            ]
        }
    };

    let configs = globSync(src_glob('config', 'json'));

    for (const file of configs) {
        config[path.basename(file, 'json').slice(0, -1)] = readJSON(file);
    }

    return {
        data: config
    };
};

const compileSassVars = (data) => {
    let vars = [];

    for (const [name, value] of Object.entries(data)) {
        vars.push(`$${name}: ${value};`);
    }

    return vars.join('\n');
};

const transform_ejs = (cb) => {
    src([src_glob('ejs'), '!' + src_glob('ejs/includes', 'ejs')])
        .pipe(ejs(readConfig()))
        .on('error', log)
        .pipe(rename({ extname: '.html' }))
        .pipe(htmlmin(htmlminopts))
        .pipe(dest(pub_dir))
        .pipe(browserSync.stream());
    cb();
};

const transform_modules = (cb) => {
    src(src_glob('mjs'))
        .pipe(
            webpack({
                watch: true,
                mode: 'production',
                output: {
                    filename: 'main.bundle.js'
                }
            })
        )
        .pipe(dest(pub_path_to('dist')))
        .pipe(browserSync.stream());
    cb();
};

const transform_sass = (cb) => {
    let colors = compileSassVars(
        readJSON(src_path_to('config/theme.json')).colors
    );

    src(src_path_to('scss/main.scss'))
        .pipe(inject.prepend(colors))
        .pipe(sass.sync().on('error', sass.logError))
        .pipe(rename({ extname: '.css' }))
        .pipe(postcss([autoprefixer(), cssnano()]))
        .pipe(dest(pub_path_to('dist')))
        .pipe(browserSync.stream());
    cb();
};

const transform_public = (cb) => {
    src(src_glob('public', '*')).pipe(dest(pub_dir)).pipe(browserSync.stream());
    cb();
};

export const build = parallel(
    transform_ejs,
    transform_modules,
    transform_sass,
    transform_public
);

export const watch = (cb) => {
    gulpwatch([src_glob('ejs'), src_glob('config', 'json')], transform_ejs);
    gulpwatch(src_glob('mjs'), transform_modules);
    gulpwatch(
        [src_glob('scss'), src_path_to('config/theme.json')],
        transform_sass
    );
    gulpwatch(src_glob('public', '*'), transform_public);
    cb();
};

export const clean = (cb) => {
    deleteAsync(`${pub_dir}**`);
    deleteAsync(pub_dir);
    cb();
};

export const serve = (cb) => {
    browserSync.init({
        server: {
            baseDir: pub_dir
        }
    });
    cb();
};

export default series(clean, build, parallel(serve, watch));
