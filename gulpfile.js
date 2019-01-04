var gulp            = require('gulp');
var gutil           = require('gulp-util');
var plumber         = require('gulp-plumber');
var sourcemaps      = require('gulp-sourcemaps');

var sass            = require('gulp-sass');
var rename          = require('gulp-rename');
var autoprefixer    = require('gulp-autoprefixer');

var concat          = require('gulp-concat');
var postCSS         = require('gulp-postcss');
var objectFitImages = require('postcss-object-fit-images');

gulp.task('styles', function() {
	gulp.src('sass/**/*.scss')
	.pipe(sourcemaps.init())
	.pipe(plumber(function (error) {
		gutil.log(gutil.colors.red('[Error]'), error.toString());
		this.emit('end');
	}))
	.pipe(sass())
	.pipe(postCSS([objectFitImages]))
	.pipe(autoprefixer({browsers: ['defaults', 'iOS >= 8']}))
	.pipe(rename('styles.css'))
	.pipe(sourcemaps.write())
	.pipe(gulp.dest('public'));
});

gulp.task('scripts', function() {
  return gulp.src([
	'js/*.js',
	])
	.pipe(sourcemaps.init())
	.pipe(plumber(function (error) {
		gutil.log(gutil.colors.red('[Error]'), error.toString());
		this.emit('end');
	}))
	.pipe(concat('scripts.js'))
	.pipe(sourcemaps.write())
	.pipe(gulp.dest('public'));
});

gulp.task('watch', function() {
	gulp.watch('sass/**/*.scss', ['styles']);
	gulp.watch('js/**/*.js', ['scripts']);
});

gulp.task('default', ['watch']);
