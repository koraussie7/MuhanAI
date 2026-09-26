// Scroll reveal + signup state. No dependencies; the page works without JS.
(() => {
	var targets = document.querySelectorAll(
		".section-title, .card, .footnote, .flow, .lede, .signup",
	);
	targets.forEach((el) => {
		el.classList.add("reveal");
	});

	if (!("IntersectionObserver" in window)) {
		targets.forEach((el) => {
			el.classList.add("in");
		});
		return;
	}

	var io = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					entry.target.classList.add("in");
					io.unobserve(entry.target);
				}
			});
		},
		{ rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
	);

	targets.forEach((el) => {
		io.observe(el);
	});
})();
