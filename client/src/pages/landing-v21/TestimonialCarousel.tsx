import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { testimonials } from "./testimonials";

export function TestimonialCarousel({ reducedMotion }: { reducedMotion: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const current = useRef(0);
  // Several end cards share a clamped scroll position on desktop. Keep the
  // explicit selection until the user starts a native scroll gesture.
  const selectedByControl = useRef(false);
  const select = (requested: number) => {
    const next = Math.max(0, Math.min(testimonials.length - 1, requested));
    selectedByControl.current = true;
    current.current = next; setIndex(next);
    const element = track.current;
    const card = element?.children[next] as HTMLElement | undefined;
    if (!element || !card) return;
    const left = element.scrollLeft + card.getBoundingClientRect().left - element.getBoundingClientRect().left;
    element.scrollTo({ left, behavior: reducedMotion ? "auto" : "smooth" });
  };
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (selectedByControl.current) return;
        const max = element.scrollWidth - element.clientWidth;
        let next = 0;
        if (max > 1 && element.scrollLeft >= max - 2) next = testimonials.length - 1;
        else {
          let distance = Infinity;
          [...element.children].forEach((card, i) => {
            const delta = Math.abs(card.getBoundingClientRect().left - element.getBoundingClientRect().left);
            if (delta < distance) { distance = delta; next = i; }
          });
        }
        current.current = next; setIndex(next);
      });
    };
    const startNativeScroll = () => { selectedByControl.current = false; };
    const resize = new ResizeObserver(() => {
      const card = element.children[current.current];
      if (card) element.scrollTo({ left: element.scrollLeft + card.getBoundingClientRect().left - element.getBoundingClientRect().left, behavior: "instant" });
    });
    resize.observe(element); element.addEventListener("scroll", sync, { passive: true });
    for (const event of ["pointerdown", "touchstart", "wheel"]) element.addEventListener(event, startNativeScroll, { passive: true });
    return () => {
      resize.disconnect(); element.removeEventListener("scroll", sync); cancelAnimationFrame(frame);
      for (const event of ["pointerdown", "touchstart", "wheel"]) element.removeEventListener(event, startNativeScroll);
    };
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? testimonials.length - 1 : null;
    if (next === null) { selectedByControl.current = false; return; }
    event.preventDefault(); select(next);
  };
  return (
    <div className="testimonial-shell">
      <div className="testimonial-toolbar"><div className="testimonial-toolbar-left">
        <span className="testimonial-counter"><span id="testimonial-current">{index + 1}</span>&nbsp;/&nbsp;5</span><span className="testimonial-hint">Scroll or use the arrow controls to view the next comment</span>
      </div><div className="testimonial-controls">
        <button className="testimonial-arrow testimonial-prev" type="button" aria-label="Previous comment" disabled={index === 0} onClick={() => select(index - 1)}>←</button>
        <button className="testimonial-arrow testimonial-next" type="button" aria-label="Next comment" disabled={index === testimonials.length - 1} onClick={() => select(index + 1)}>→</button>
      </div></div>
      {/* A focusable scroll region supplies optional arrow/Home/End controls without claiming button semantics. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div className="testimonials" id="testimonial-track" ref={track} role="region" aria-roledescription="carousel" aria-label="User feedback carousel" tabIndex={0} onKeyDown={onKeyDown}>
        {testimonials.map((testimonial, i) => (
          <article key={testimonial.name} className={`testimonial${i === 0 ? " testimonial-featured" : ""}`} aria-label={`Comment ${i + 1} of 5`}>
            <p className="testimonial-copy">{testimonial.quote}</p><div className="testimonial-meta"><div className="testimonial-avatar" aria-hidden="true">{testimonial.initials}</div><div><b>{testimonial.name}</b></div></div>
          </article>
        ))}
      </div>
      <div className="testimonial-progress" role="group" aria-label="Select comment">
        {testimonials.map((testimonial, i) => <button key={testimonial.name} type="button" aria-label={`Comment ${i + 1}`} {...{ "aria-current": i === index ? "true" as const : "false" as const }} onClick={() => select(i)} />)}
      </div>
    </div>
  );
}
